"""Smooth the nasal pad and form a curved opening around the alar corner."""
import bpy,bmesh,math
from mathutils import Vector

def Smooth(a,b,value):
    t=max(0,min(1,(value-a)/(b-a)));return t*t*(3-2*t)

def Value(rows,z):
    if z<=rows[0][0]:return rows[0][1]
    if z>=rows[-1][0]:return rows[-1][1]
    for a,b in zip(rows,rows[1:]):
        if a[0]<=z<=b[0]:return a[1]+(b[1]-a[1])*(z-a[0])/(b[0]-a[0])

def FitBoundaryAngles(ordered,coordinates,phiCentre,phiRadius):
    def Angles(vertices):
        return [math.atan2(coordinates(v.co)[1],(coordinates(v.co)[0]-phiCentre)/phiRadius) for v in vertices]
    angles=Angles(ordered)
    steps=[(angles[(i+1)%len(angles)]-angle+math.pi)%(2*math.pi)-math.pi for i,angle in enumerate(angles)]
    if abs(abs(sum(steps))-2*math.pi)>1e-5:raise RuntimeError('Nasal boundary does not wind once around the new aperture')
    if sum(steps)<0:ordered.reverse();angles=Angles(ordered)
    start=min(range(len(angles)),key=angles.__getitem__)
    ordered[:]=ordered[start:]+ordered[:start];angles=Angles(ordered)
    # A jagged triangulated cut may backtrack in projection. Fit a strictly
    # increasing circular parameter before seating it on the smooth alar rim.
    unwrapped=[angles[0]]
    for previous,current in zip(angles,angles[1:]):unwrapped.append(unwrapped[-1]+(current-previous+math.pi)%(2*math.pi)-math.pi)
    unwrapped.append(unwrapped[0]+2*math.pi)
    gap=.005;blocks=[]
    for i,value in enumerate(unwrapped):
        weight=1e12 if i in (0,len(ordered)) else 1
        blocks.append([i,i,weight,(value-i*gap)*weight])
        while len(blocks)>1 and blocks[-2][3]/blocks[-2][2]>blocks[-1][3]/blocks[-1][2]:
            b=blocks.pop();a=blocks.pop();blocks.append([a[0],b[1],a[2]+b[2],a[3]+b[3]])
    fitted=[0]*len(unwrapped)
    for start,end,weight,total in blocks:
        for i in range(start,end+1):fitted[i]=total/weight+i*gap
    if min(b-a for a,b in zip(fitted,fitted[1:]))<gap-1e-7:raise RuntimeError('Nasal boundary parameter folds back')
    return fitted[:-1],max(abs(a-b) for a,b in zip(unwrapped,fitted))

def CloseBoundaryPinches(bm,selected):
    bm.verts.index_update();bm.faces.index_update();added=0
    for iteration in range(32):
        edges={e for f in selected for e in f.edges if any(other not in selected for other in e.link_faces)}
        vertices={v for e in edges for v in e.verts}
        pinches=sorted((v for v in vertices if sum(e in edges for e in v.link_edges)>2),key=lambda v:v.index)
        if not pinches:return added
        vertex=pinches[0];remaining={f for f in vertex.link_faces if f not in selected};fans=[]
        while remaining:
            seed=min(remaining,key=lambda f:f.index);remaining.remove(seed);fan={seed};queue=[seed]
            while queue:
                for edge in queue.pop().edges:
                    if vertex not in edge.verts:continue
                    for face in edge.link_faces:
                        if face in remaining:remaining.remove(face);fan.add(face);queue.append(face)
            fans.append(fan)
        if len(fans)<2:raise RuntimeError('Nasal pinch has no separate retained face fans')
        fan=min(fans,key=lambda group:(len(group),min(f.index for f in group)))
        if len(fan)>12:raise RuntimeError('Nasal pinch repair would leave its local cut')
        selected.update(fan);added+=len(fan)
    raise RuntimeError('Nasal pinch repair did not converge')

def RebuildWrappedNostrils(skin):
    from mathutils.bvhtree import BVHTree
    tree=BVHTree.FromPolygons([v.co for v in skin.data.vertices],[tuple(f.vertices) for f in skin.data.polygons])
    profile=[]
    for z in [.875,.89,.905,.92,.935,.95,.965,.98,1.00,1.02]:
        hit,_,_,_=tree.ray_cast(Vector((0,2,z)),Vector((0,-1,0)),1)
        if hit is not None:profile.append((z,hit.y))
    if len(profile)<8:raise RuntimeError('Incomplete nasal front envelope')
    radiusX,depth=.074,.090
    def Envelope(sign,phi,z):
        x=sign*radiusX*math.sin(phi)
        y=Value(profile,z)-depth+depth*math.cos(phi)
        return Vector((x,y,z))
    def Normal(sign,phi,z):
        derivative=depth/radiusX*math.tan(phi)
        dz=(Value(profile,z+.001)-Value(profile,z-.001))/.002
        return Vector((sign*derivative,1,-dz)).normalized()
    moved=0
    for vertex in skin.data.vertices:
        x,y,z=vertex.co
        if abs(x)>=radiusX or y<=1.230 or not .885<z<.990:continue
        targetY=Value(profile,z)-depth+depth*math.sqrt(max(0,1-(abs(x)/radiusX)**2))
        weight=Smooth(1.230,1.260,y)*Smooth(.885,.905,z)*(1-Smooth(.965,.990,z))
        delta=max(-.025,min(.025,targetY-y))*weight;vertex.co.y+=delta;moved=max(moved,abs(delta))
    skin.data.update()
    tree=BVHTree.FromPolygons([v.co for v in skin.data.vertices],[tuple(f.vertices) for f in skin.data.polygons])
    bm=bmesh.new();bm.from_mesh(skin.data);deform=bm.verts.layers.deform.verify()
    localFaces=[f for f in bm.faces if any(v.co.y>1.24 and .885<v.co.z<.99 and abs(v.co.x)<.08 for v in f.verts)]
    bmesh.ops.triangulate(bm,faces=localFaces)
    for iteration in range(2):
        longEdges=[e for e in bm.edges if e.calc_length()>.012 and all(v.co.y>1.24 and .88<v.co.z<1.0 and abs(v.co.x)<.09 for v in e.verts)]
        if not longEdges:break
        bmesh.ops.subdivide_edges(bm,edges=longEdges,cuts=1,use_grid_fill=True)
    localFaces=[f for f in bm.faces if len(f.verts)>3 and any(v.co.y>1.24 and .885<v.co.z<.99 and abs(v.co.x)<.08 for v in f.verts)]
    bmesh.ops.triangulate(bm,faces=localFaces)
    nasalDepth=bm.verts.layers.float.get('NasalDepth') or bm.verts.layers.float.new('NasalDepth')
    color=bm.verts.layers.float_color.get('CoatColor');head=skin.vertex_groups['DonkeyHeadPivot'].index
    interior=next(i for i,m in enumerate(skin.data.materials) if 'NostrilInterior' in m.name)
    shader=skin.data.materials[interior].node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value=(.002,.0015,.001,1);shader.inputs['Roughness'].default_value=.90;shader.inputs['Specular IOR Level'].default_value=.12
    wall=bpy.data.materials.get('DonkeyNasalWall') or bpy.data.materials.new('DonkeyNasalWall');wall.use_nodes=True
    nodes,links=wall.node_tree.nodes,wall.node_tree.links;nodes.clear()
    shader=nodes.new('ShaderNodeBsdfPrincipled');output=nodes.new('ShaderNodeOutputMaterial');links.new(shader.outputs['BSDF'],output.inputs['Surface'])
    shader.inputs['Roughness'].default_value=.84;shader.inputs['Specular IOR Level'].default_value=.18
    paint=nodes.new('ShaderNodeVertexColor');paint.layer_name='CoatColor'
    multiply=nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1;multiply.inputs[2].default_value=(.45,.45,.45,1);links.new(paint.outputs['Color'],multiply.inputs[1])
    attr=nodes.new('ShaderNodeAttribute');attr.attribute_name='NasalDepth'
    mix=nodes.new('ShaderNodeMixRGB');links.new(attr.outputs['Fac'],mix.inputs[0]);links.new(multiply.outputs[0],mix.inputs[1]);mix.inputs[2].default_value=(.002,.0015,.001,1);links.new(mix.outputs[0],shader.inputs['Base Color'])
    wallIndex=skin.data.materials.find(wall.name)
    if wallIndex<0:skin.data.materials.append(wall);wallIndex=len(skin.data.materials)-1
    phiCentre,phiRadius,zCentre,zSlope,zRadius=.70,.24,.928,.070,.013
    reports=[]
    for side,sign in [('Left',-1),('Right',1)]:
        point,_,_,_=tree.ray_cast(Vector((sign*.048,2,.926)),Vector((0,-1,0)),1)
        if point is None:raise RuntimeError('Missing muzzle for nasal aperture')
        cutNormal=Vector((sign*.70,.714,.03)).normalized()
        cutU=Vector((0,0,1)).cross(cutNormal).normalized();cutV=cutNormal.cross(cutU).normalized()
        cutV=(cutV*math.cos(math.radians(30))-cutU*(sign*math.sin(math.radians(30)))).normalized();cutU=cutV.cross(cutNormal).normalized()
        def Coordinates(point):
            phi=math.asin(min(.99999,abs(point.x)/radiusX));centreZ=zCentre+zSlope*(phi-phiCentre)
            return phi,(point.z-centreZ)/zRadius
        selected=set()
        for face in bm.faces:
            delta=face.calc_center_median()-point
            if (delta.dot(cutU)/.014)**2+(delta.dot(cutV)/.029)**2<1 and abs(delta.dot(cutNormal))<.028:selected.add(face)
        if not selected:raise RuntimeError('Wrapped nostril missed the nasal surface')
        remaining=set(bm.faces)-selected;islandFaces=0
        centre=Envelope(sign,phiCentre,zCentre)
        while remaining:
            seed=remaining.pop();component={seed};queue=[seed];adjacent=False
            while queue:
                for edge in queue.pop().edges:
                    for other in edge.link_faces:
                        if other in selected:adjacent=True
                        if other in remaining:remaining.remove(other);component.add(other);queue.append(other)
            vertices={v for f in component for v in f.verts}
            if adjacent and len(component)<400 and all((v.co-centre).length<.065 for v in vertices):selected.update(component);islandFaces+=len(component)
        pinchFaces=CloseBoundaryPinches(bm,selected)
        cutEdges={e for f in selected for e in f.edges if any(other not in selected for other in e.link_faces)}
        bmesh.ops.delete(bm,geom=list(selected),context='FACES')
        edges={e for e in cutEdges if e.is_valid and e.is_boundary}
        vertices={v for e in edges for v in e.verts}
        if len(vertices)<6 or any(sum(e in edges for e in v.link_edges)!=2 for v in vertices):
            degrees={degree:sum(sum(e in edges for e in v.link_edges)==degree for v in vertices) for degree in range(1,7)}
            raise RuntimeError('Wrapped nostril is not a simple closed boundary: '+str({'side':side,'vertices':len(vertices),'degrees':degrees}))
        ordered=[];current=next(iter(vertices));previous=None
        while current not in ordered:
            ordered.append(current);neighbours=[e.other_vert(current) for e in current.link_edges if e in edges and e.other_vert(current)!=previous]
            previous,current=current,neighbours[0]
        if len(ordered)!=len(vertices):
            remainingVertices=set(vertices);groups=[]
            while remainingVertices:
                seed=remainingVertices.pop();group={seed};queue=[seed]
                while queue:
                    for edge in queue.pop().link_edges:
                        if edge not in edges:continue
                        for other in edge.verts:
                            if other in remainingVertices:remainingVertices.remove(other);group.add(other);queue.append(other)
                groups.append({'vertices':len(group),'centre':list(sum((v.co for v in group),Vector())/len(group))})
            raise RuntimeError('Wrapped nostril has multiple boundaries: '+str(groups))
        inner=[];lips=[];airway=Vector((sign*.68,.73,0)).normalized()
        angles,angleCorrection=FitBoundaryAngles(ordered,Coordinates,phiCentre,phiRadius)
        for vertex,angle in zip(ordered,angles):
            phi=phiCentre+phiRadius*math.cos(angle);z=zCentre+zSlope*(phi-phiCentre)+zRadius*math.sin(angle)
            border=Envelope(sign,phi,z);normal=Normal(sign,phi,z)
            vertex.co=border
            lip=bm.verts.new(vertex.co+normal*.0025);lip[deform][head]=1;lip[nasalDepth]=.65
            if color:lip[color]=vertex[color]
            lips.append(lip)
            p=centre+(lip.co-centre)*.72-airway*.022;p.z=lip.co.z
            point=bm.verts.new(p);point[deform][head]=1;point[nasalDepth]=1
            if color:point[color]=vertex[color]
            inner.append(point)
        for i in range(len(ordered)):
            j=(i+1)%len(ordered)
            f=bm.faces.new((ordered[i],ordered[j],lips[j],lips[i]));f.material_index=0;f.smooth=True
            f=bm.faces.new((lips[i],lips[j],inner[j],inner[i]));f.material_index=wallIndex;f.smooth=True
        f=bm.faces.new(tuple(reversed(inner)));f.material_index=interior;f.smooth=True
        reports.append({'side':side,'method':'curved alar opening around an elliptic nasal pad; shaded mucosal wall and dark airway floor','centre':list(centre),'phiRange':[phiCentre-phiRadius,phiCentre+phiRadius],'zSlopeMPerRadian':zSlope,'verticalRadiusM':zRadius,'boundaryVertices':len(ordered),'boundaryAngleCorrectionRad':angleCorrection,'closedPinchFaces':pinchFaces,'removedEnclosedPatchFaces':islandFaces,'envelopeMaxDisplacementM':moved,'frontProfile':profile})
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(skin.data);bm.free();skin.data.update()
    return reports
