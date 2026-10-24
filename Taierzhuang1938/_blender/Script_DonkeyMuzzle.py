"""Clean, reference-sized anterior muzzle replacing folded donor surfaces."""
import bpy,bmesh,math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_ray_tri,barycentric_transform

def BuildLoop(edges):
    vertices={v for edge in edges for v in edge.verts}
    if any(sum(edge in edges for edge in v.link_edges)!=2 for v in vertices):raise RuntimeError('Snout root is not a simple loop')
    ordered=[];current=max(vertices,key=lambda v:v.co.x);previous=None
    while current not in ordered:
        ordered.append(current);nextVertices=[edge.other_vert(current) for edge in current.link_edges if edge in edges and edge.other_vert(current)!=previous];previous,current=current,nextVertices[0]
    if len(ordered)!=len(vertices):raise RuntimeError('Snout root loop is disconnected')
    area=sum(a.co.x*b.co.z-b.co.x*a.co.z for a,b in zip(ordered,ordered[1:]+ordered[:1]))
    if area<0:ordered.reverse();start=max(range(len(ordered)),key=lambda i:ordered[i].co.x);ordered[:]=ordered[start:]+ordered[:start]
    return ordered

def RebuildSnoutSurface(skin):
    bm=bmesh.new();bm.from_mesh(skin.data);before=sum(len(f.verts)-2 for f in bm.faces)
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-7,plane_co=(0,1.21,0),plane_no=(0,1,0),clear_inner=False,clear_outer=False)
    selected={f for f in bm.faces if f.calc_center_median().y>1.2100001};removed=len(selected)
    cut={e for f in selected for e in f.edges if any(other not in selected for other in e.link_faces)}
    bmesh.ops.delete(bm,geom=list(selected),context='FACES');remaining={e for e in cut if e.is_valid and e.is_boundary};loops=[]
    while remaining:
        seed=remaining.pop();group={seed};vertices={*seed.verts};queue=list(seed.verts)
        while queue:
            for edge in queue.pop().link_edges:
                if edge not in remaining:continue
                remaining.remove(edge);group.add(edge)
                for vertex in edge.verts:
                    if vertex not in vertices:vertices.add(vertex);queue.append(vertex)
        loops.append(BuildLoop(group))
    if len(loops)!=2:raise RuntimeError('Expected outer muzzle and internal donor-channel root loops, found '+str(len(loops)))
    outer=max(loops,key=lambda loop:max(v.co.z for v in loop)-min(v.co.z for v in loop));inner=next(loop for loop in loops if loop is not outer)
    material=next(i for i,m in enumerate(skin.data.materials) if m.name.startswith('DonkeyCartGreyCoat'))
    # Seal the donor's internal channel at the root instead of carrying its
    # overlapping wall into the replacement exterior muzzle.
    face=bm.faces.new(tuple(reversed(inner)));face.material_index=material;face.smooth=True
    head=skin.vertex_groups['DonkeyHeadPivot'].index;deform=bm.verts.layers.deform.verify();color=bm.verts.layers.float_color.get('CoatColor')
    def New(point,pigment):
        v=bm.verts.new(point);v[deform][head]=1
        if color:v[color]=pigment
        return v
    def Face(vertices):
        f=bm.faces.new(vertices);f.material_index=material;f.smooth=True
    lengths=[0]
    for a,b in zip(outer,outer[1:]+outer[:1]):lengths.append(lengths[-1]+(b.co-a.co).length)
    perimeter=lengths[-1];fractions=[value/perimeter for value in lengths];count=78
    top=max(v.co.z for v in outer);bottom=min(v.co.z for v in outer);rx=max(abs(v.co.x) for v in outer)
    profiles=[(1.21,top,bottom,rx),(1.232,1.150,.874,.070),(1.260,1.085,.858,.073),(1.278,1.045,.850,.074),(1.298,1.005,.850,.072),(1.312,.978,.863,.064),(1.331,.952,.902,.039),(1.337,.928,.928,0)]
    def Profile(y,column):
        slopes=[(b[column]-a[column])/(b[0]-a[0]) for a,b in zip(profiles,profiles[1:])];tangents=[slopes[0]]
        for a,b in zip(slopes,slopes[1:]):tangents.append(0 if a*b<=0 else 2*a*b/(a+b))
        tangents.append(slopes[-1])
        for i,(a,b) in enumerate(zip(profiles,profiles[1:])):
            if a[0]<=y<=b[0]:
                span=b[0]-a[0];t=(y-a[0])/span
                return (2*t**3-3*t*t+1)*a[column]+(t**3-2*t*t+t)*span*tangents[i]+(-2*t**3+3*t*t)*b[column]+(t**3-t*t)*span*tangents[i+1]
        return profiles[-1][column]
    pigment=sum((v[color] for v in outer),Vector((0,0,0,0)))/len(outer) if color else None
    rings=[]
    longitudinal=[1.216,1.230,1.245,1.260]+[1.266+.0025*i for i in range(28)]+[1.33425,1.335,1.33575,1.33625,1.3366]
    def RingStep(a,b):
        au,al,aw=[Profile(a,c) for c in (1,2,3)];bu,bl,bw=[Profile(b,c) for c in (1,2,3)]
        return max(Vector(((bw-aw)*math.cos(2*math.pi*i/count),b-a,((bu+bl)-(au+al))/2+((bu-bl)-(au-al))/2*math.sin(2*math.pi*i/count))).length for i in range(count))
    for iteration in range(8):
        rows=longitudinal+[1.337];insert=[(a+b)/2 for a,b in zip(rows,rows[1:]) if a>=1.266 and RingStep(a,b)>.0055]
        if not insert:break
        longitudinal=sorted(longitudinal+insert)
    else:raise RuntimeError('Nasal loft failed to converge to the authored sampling distance')
    for y in longitudinal:
        upper,lower,width=[Profile(y,c) for c in (1,2,3)];centre=(upper+lower)/2;radius=(upper-lower)/2;ring=[]
        for index in range(count):
            angle=2*math.pi*index/count;point=Vector((width*math.cos(angle),y,centre+radius*math.sin(angle)))
            if y<1.232:
                distance=perimeter*index/count;segment=next(i for i in range(len(outer)) if lengths[i]<=distance<=lengths[i+1]);t=(distance-lengths[segment])/max(1e-8,lengths[segment+1]-lengths[segment])
                source=outer[segment].co.lerp(outer[(segment+1)%len(outer)].co,t);source.y=y
                point=source.lerp(point,(y-1.21)/.022)
            ring.append(New(point,pigment))
        rings.append(ring)
    a,b=outer,rings[0];i=j=0;n=len(a)
    while i<n or j<count:
        ta=fractions[i+1] if i<n else 100;tb=(j+1)/count if j<count else 100
        if abs(ta-tb)<1e-7:Face((a[i%n],a[(i+1)%n],b[(j+1)%count],b[j%count]));i+=1;j+=1
        elif ta<tb:Face((a[i%n],a[(i+1)%n],b[j%count]));i+=1
        else:Face((a[i%n],b[(j+1)%count],b[j%count]));j+=1
    for a,b in zip(rings,rings[1:]):
        for index in range(count):j=(index+1)%count;Face((a[index],a[j],b[j],b[index]))
    tip=New(Vector((0,1.337,.928)),pigment)
    for index in range(count):Face((rings[-1][index],rings[-1][(index+1)%count],tip))
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));after=sum(len(f.verts)-2 for f in bm.faces);bm.to_mesh(skin.data);bm.free();skin.data.update()
    return {'method':'clean elliptical muzzle loft with original posterior boundary; internal donor channel sealed at its root',
        'rootY':1.21,'outerRootVertices':len(outer),'internalRootVertices':len(inner),'removedFaces':removed,'triangleDelta':after-before,'profiles':profiles,'sections':count,'longitudinalRows':len(longitudinal),'nasalLongitudinalStepM':.0025}

def RebuildNostrilOpenings(skin):
    tree=BVHTree.FromPolygons([v.co for v in skin.data.vertices],[tuple(f.vertices) for f in skin.data.polygons])
    bm=bmesh.new();bm.from_mesh(skin.data);before=sum(len(f.verts)-2 for f in bm.faces)
    def Local(v):return v.co.y>1.27 and .885<v.co.z<.985 and abs(v.co.x)<.085
    bmesh.ops.triangulate(bm,faces=[f for f in bm.faces if len(f.verts)>3 and any(Local(v) for v in f.verts)])
    # The anterior loft is authored densely enough for the nasal cut. Avoid
    # repeated partial-edge subdivision, which can add duplicate grid faces.
    localEdges=[e.calc_length() for e in bm.edges if all(Local(v) for v in e.verts)]
    if max(localEdges,default=0)>.009:raise RuntimeError('Nasal loft sampling is too coarse for a clean opening')
    refined=sum(len(f.verts)-2 for f in bm.faces)-before
    if refined>5500:raise RuntimeError('Nasal local refinement exceeded its topology allowance')
    deform=bm.verts.layers.deform.verify();head=skin.vertex_groups['DonkeyHeadPivot'].index;color=bm.verts.layers.float_color.get('CoatColor')
    depth=bm.verts.layers.float.get('NasalDepth') or bm.verts.layers.float.new('NasalDepth')
    wall=bpy.data.materials.get('DonkeyNasalWall') or bpy.data.materials.new('DonkeyNasalWall');wall.use_nodes=True;nodes,links=wall.node_tree.nodes,wall.node_tree.links;nodes.clear()
    shader=nodes.new('ShaderNodeBsdfPrincipled');output=nodes.new('ShaderNodeOutputMaterial');links.new(shader.outputs['BSDF'],output.inputs['Surface']);shader.inputs['Roughness'].default_value=.84
    pigment=nodes.new('ShaderNodeVertexColor');pigment.layer_name='CoatColor';attribute=nodes.new('ShaderNodeAttribute');attribute.attribute_name='NasalDepth';mix=nodes.new('ShaderNodeMixRGB')
    links.new(attribute.outputs['Fac'],mix.inputs[0]);links.new(pigment.outputs['Color'],mix.inputs[1]);mix.inputs[2].default_value=(.002,.0015,.001,1);links.new(mix.outputs[0],shader.inputs['Base Color'])
    slot=skin.data.materials.find(wall.name)
    if slot<0:skin.data.materials.append(wall);slot=len(skin.data.materials)-1
    interior=next(i for i,m in enumerate(skin.data.materials) if 'NostrilInterior' in m.name)
    skin.data.materials[interior].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.002,.0015,.001,1)
    reports=[]
    for side,sign in [('Left',-1),('Right',1)]:
        point,_,_,_=tree.ray_cast(Vector((sign*.047,2,.933)),Vector((0,-1,0)),1)
        if point is None:raise RuntimeError('Clean muzzle has no nasal surface')
        normal=Vector((sign*.70,.714,.03)).normalized();u=Vector((0,0,1)).cross(normal).normalized();v=normal.cross(u).normalized()
        v=(v*math.cos(math.radians(30))-u*(sign*math.sin(math.radians(30)))).normalized();u=v.cross(normal).normalized()
        selected={f for f in bm.faces if (lambda d:(d.dot(u)/.017)**2+(d.dot(v)/.030)**2<1 and abs(d.dot(normal))<.028)(f.calc_center_median()-point)}
        if not selected:raise RuntimeError('Nostril cut missed the clean muzzle')
        namespace={};file=__import__('pathlib').Path(bpy.context.scene['DonkeyCartProject'])/'_blender/Script_DonkeyNasalEnvelope.py';exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),namespace);namespace['CloseBoundaryPinches'](bm,selected)
        cut={e for f in selected for e in f.edges if any(other not in selected for other in e.link_faces)};bmesh.ops.delete(bm,geom=list(selected),context='FACES')
        edges={e for e in cut if e.is_valid and e.is_boundary};vertices={v for e in edges for v in e.verts}
        if len(vertices)<6 or any(sum(e in edges for e in p.link_edges)!=2 for p in vertices):raise RuntimeError('Nostril boundary is not one simple loop')
        ordered=[];current=max(vertices,key=lambda p:(p.co-point).dot(u));previous=None
        while current not in ordered:
            ordered.append(current);nextVertices=[e.other_vert(current) for e in current.link_edges if e in edges and e.other_vert(current)!=previous];previous,current=current,nextVertices[0]
        if len(ordered)!=len(vertices):raise RuntimeError('Nostril cut has multiple boundaries')
        def Coordinates(position):
            delta=position-point;return delta.dot(u)/.017,delta.dot(v)/.030
        angles,correction=namespace['FitBoundaryAngles'](ordered,Coordinates,0,1)
        fractions=[(angle-angles[0])/(2*math.pi) for angle in angles]+[1];count=32;rings=[]
        tint=sum((p[color] for p in ordered),Vector((0,0,0,0)))/len(ordered) if color else None
        for radiusU,radiusV,offset,shade in [(.014,.025,0,0),(.012,.0225,.0018,.65),(.009,.018,-.020,1)]:
            ring=[]
            for index in range(count):
                angle=angles[0]+2*math.pi*index/count;border=point+u*(radiusU*math.cos(angle))+v*(radiusV*math.sin(angle))
                hit,n,_,_=tree.ray_cast(border+normal*.06,-normal,.12)
                if hit is None:raise RuntimeError('Nostril rim left the clean muzzle')
                position=hit+n*offset if offset>=0 else point+(hit-point)*.75+normal*offset
                p=bm.verts.new(position);p[deform][head]=1;p[depth]=shade
                if color:p[color]=tint
                ring.append(p)
            rings.append(ring)
        def Face(vertices,material):
            f=bm.faces.new(vertices);f.material_index=material;f.smooth=True
        a,b=ordered,rings[0];i=j=0;n=len(a)
        while i<n or j<count:
            ta=fractions[i+1] if i<n else 100;tb=(j+1)/count if j<count else 100
            if abs(ta-tb)<1e-7:Face((a[i%n],a[(i+1)%n],b[(j+1)%count],b[j%count]),0);i+=1;j+=1
            elif ta<tb:Face((a[i%n],a[(i+1)%n],b[j%count]),0);i+=1
            else:Face((a[i%n],b[(j+1)%count],b[j%count]),0);j+=1
        for index,(a,b) in enumerate(zip(rings,rings[1:])):
            for i in range(count):j=(i+1)%count;Face((a[i],a[j],b[j],b[i]),0 if index==0 else slot)
        Face(tuple(reversed(rings[-1])),interior)
        reports.append({'side':side,'centre':list(point),'boundaryVertices':len(ordered),'rimVertices':count,'openingRadiiM':[.012,.0225],'depthM':.020,'localRefinementTriangles':refined,'boundaryAngleCorrectionRad':correction,'method':'curved rim inset into the clean loft; untouched outer cut boundary, shaded wall and closed airway floor'})
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(skin.data);bm.free();skin.data.update();return reports

def RebuildOralContour(skin,rig):
    tree=BVHTree.FromPolygons([v.co for v in skin.data.vertices],[tuple(f.vertices) for f in skin.data.polygons])
    curve=[]
    for i in range(21):
        angle=-math.pi/2+math.pi*i/20;s=math.sin(angle)
        target=Vector((.070*s,1.313-.047*abs(s)**4,.866+.049*s*s))
        point,normal,_,_=tree.find_nearest(target);curve.append((point,normal))
    moved=0;maximum=0
    for vertex in skin.data.vertices:
        if vertex.co.y<1.235 or vertex.co.z>.94 or vertex.co.z<.84:continue
        nearest=None;distance=1e9
        for (a,na),(b,nb) in zip(curve,curve[1:]):
            edge=b-a;t=max(0,min(1,(vertex.co-a).dot(edge)/max(1e-10,edge.length_squared)));point=a+edge*t;d=(vertex.co-point).length
            if d<distance:distance=d;nearest=(point,na.lerp(nb,t).normalized())
        if distance>.012:continue
        point,normal=nearest;up=Vector((0,0,1))-normal*normal.z
        if up.length<.05:continue
        up.normalize();s=(vertex.co-point).dot(up)
        lift=(.0007*math.exp(-((s-.004)/.003)**2)+.0010*math.exp(-((s+.0045)/.0035)**2)-.0008*math.exp(-(s/.0023)**2))
        lift*=max(0,1-(distance/.012)**4);vertex.co+=normal*lift;moved+=1;maximum=max(maximum,abs(lift))
    skin.data.update();tree=BVHTree.FromPolygons([v.co for v in skin.data.vertices],[tuple(f.vertices) for f in skin.data.polygons])
    curve=[tree.find_nearest(point)[0] for point,_ in curve]
    obj=bpy.data.objects['DonkeyMouthSeam'];back=(rig.matrix_world.inverted()@obj.matrix_world).inverted();vertices=[];faces=[]
    for i,point in enumerate(curve):
        tangent=(curve[min(len(curve)-1,i+1)]-curve[max(0,i-1)]).normalized();_,normal,_,_=tree.find_nearest(point)
        across=normal.cross(tangent).normalized();normal=tangent.cross(across).normalized()
        radius=.00022+.00033*math.sin(math.pi*i/20)**.6
        for j in range(6):
            angle=2*math.pi*j/6;vertices.append(back@(point-normal*.0001+radius*(normal*math.cos(angle)+across*math.sin(angle))))
        if i:
            for j in range(6):a=(i-1)*6+j;b=(i-1)*6+(j+1)%6;c=i*6+(j+1)%6;d=i*6+j;faces.append((a,b,c,d))
    faces.extend((tuple(reversed(range(6))),tuple(range(120,126))))
    obj.data.clear_geometry();obj.data.from_pydata(vertices,[],faces);obj.data.update()
    for face in obj.data.polygons:face.use_smooth=True
    for group in list(obj.vertex_groups):obj.vertex_groups.remove(group)
    obj.vertex_groups.new(name='DonkeyHeadPivot').add(list(range(len(vertices))),1,'REPLACE')
    matrix=rig.matrix_world.inverted()@obj.matrix_world;distances=[tree.find_nearest(matrix@v.co)[3] for v in obj.data.vertices]
    if max(distances)>.001:raise RuntimeError('Oral crease left the actual muzzle surface')
    return {'method':'shallow upper/lower lip rolls in the continuous skin and a surface-seated closed oral crease','stations':21,'vertices':len(vertices),'tubeSides':6,'creaseRadiusM':[.00022,.00055],'surfaceDistanceM':[min(distances),max(distances)],'movedSkinVertices':moved,'maximumSkinDisplacementM':maximum,'centres':[list(point) for point in curve]}

def CheckMuzzleIntegrity(skin):
    mesh=skin.data;bm=bmesh.new();bm.from_mesh(mesh)
    record={'boundaryEdges':sum(e.is_boundary for e in bm.edges),'nonmanifoldEdges':sum(not e.is_manifold for e in bm.edges),'volumeM3':bm.calc_volume(signed=True)};bm.free()
    if record['boundaryEdges'] or record['nonmanifoldEdges'] or not .08<record['volumeM3']<.25:raise RuntimeError('Muzzle rebuild damaged the closed skin: '+str(record))
    mesh.calc_loop_triangles();triangles=list(mesh.loop_triangles);points=[v.co.copy() for v in mesh.vertices]
    tree=BVHTree.FromPolygons(points,[tuple(t.vertices) for t in triangles],all_triangles=True);crossings=[];tested=0
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
        if min(sum(p.y for p in pa)/3,sum(p.y for p in pb)/3)<1.215:continue
        tested+=1;hit=Cross(pa,pb)
        if hit is None:hit=Cross(pb,pa)
        if hit is not None:crossings.append((i,j,list(hit)))
    record.update({'anteriorCrossings':len(crossings),'testedNonAdjacentPairs':tested,'scope':'proper triangle crossings in anterior skin beyond Y 1.215 m; shared edges and point-only contact excluded'})
    if crossings:raise RuntimeError('Rebuilt anterior muzzle intersects itself: '+str(crossings[:5]))
    return record

def ApplyReferenceMuzzle(scene,skin,rig):
    if scene.get('DonkeyMuzzleRevision'):raise RuntimeError('Muzzle recipe requires the original reference-fit skin')
    skin.data.calc_loop_triangles();before=len(skin.data.loop_triangles)
    report={'snout':RebuildSnoutSurface(skin),'nostrils':RebuildNostrilOpenings(skin),'mouth':RebuildOralContour(skin,rig)}
    report['integrity']=CheckMuzzleIntegrity(skin);skin.data.calc_loop_triangles();report['skinTriangleDelta']=len(skin.data.loop_triangles)-before
    scene['DonkeyMuzzleRevision']='20261024MuzzleV14';report['version']=scene['DonkeyMuzzleRevision'];return report
