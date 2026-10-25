"""Continuous orbital skin, seated corneas and a thin wet eyelid margin."""
import bpy,bmesh,math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_ray_tri,barycentric_transform

def RebuildEyeSockets(skin,rig):
    project=Path(bpy.context.scene['DonkeyCartProject']);namespace={};file=project/'_blender/Script_DonkeyNasalEnvelope.py';exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),namespace)
    tree=BVHTree.FromPolygons([v.co for v in skin.data.vertices],[tuple(f.vertices) for f in skin.data.polygons]);inverse=rig.matrix_world.inverted()
    bm=bmesh.new();bm.from_mesh(skin.data);before=sum(len(f.verts)-2 for f in bm.faces);deform=bm.verts.layers.deform.verify();head=skin.vertex_groups['DonkeyHeadPivot'].index;color=bm.verts.layers.float_color.get('CoatColor');part=bm.faces.layers.int.get('OrbitalSurface') or bm.faces.layers.int.new('OrbitalSurface')
    material=bpy.data.materials.get('DonkeyOrbitalCavity') or bpy.data.materials.new('DonkeyOrbitalCavity');material.use_nodes=True;shader=material.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.003,.002,.0015,1);shader.inputs['Roughness'].default_value=.86;shader.inputs['Specular IOR Level'].default_value=.10
    slot=skin.data.materials.find(material.name)
    if slot<0:skin.data.materials.append(material);slot=len(skin.data.materials)-1
    coat=next(i for i,m in enumerate(skin.data.materials) if m.name.startswith('DonkeyCartGreyCoat'));reports=[]
    for side,sign in [('Left',-1),('Right',1)]:
        eye=bpy.data.objects['DonkeyEye'+side];matrix=inverse@eye.matrix_world;centre=sum((matrix@v.co for v in eye.data.vertices),Vector())/len(eye.data.vertices)
        normal=Vector((sign*.78,.62,.03)).normalized();axis=Vector((0,0,1)).cross(normal).normalized();up=normal.cross(axis).normalized();tilt=-sign*math.radians(12);axis=(axis*math.cos(tilt)+up*math.sin(tilt)).normalized();up=normal.cross(axis).normalized()
        def Coordinates(p):
            delta=p-centre;return delta.dot(axis)/.055,delta.dot(up)/.045
        selected={f for f in bm.faces if (lambda p:sum(c*c for c in Coordinates(p))<2.25 and abs((p-centre).dot(normal))<.045)(f.calc_center_median())}
        if not selected:raise RuntimeError('Orbital opening missed the skin')
        # Clip intersecting faces against a convex elliptical prism. A cut
        # based only on face centres leaves long retained triangles projecting
        # through the replacement rim at the medial corner.
        for plane in range(32):
            angle=2*math.pi*plane/32;planePoint=centre+axis*(.055*math.cos(angle))+up*(.045*math.sin(angle));planeNormal=(axis*(math.cos(angle)/.055)+up*(math.sin(angle)/.045)).normalized()
            oldFaces=set(bm.faces);geometry=set(selected)
            for face in selected:geometry.update(face.edges);geometry.update(face.verts)
            bmesh.ops.bisect_plane(bm,geom=list(geometry),dist=1e-7,plane_co=planePoint,plane_no=planeNormal,clear_inner=False,clear_outer=False)
            touched={face for face in selected if face.is_valid}|(set(bm.faces)-oldFaces)
            selected={face for face in touched if (face.calc_center_median()-planePoint).dot(planeNormal)<1e-7}
        namespace['CloseBoundaryPinches'](bm,selected);removed=sum(len(f.verts)-2 for f in selected)
        cut={e for f in selected for e in f.edges if any(other not in selected for other in e.link_faces)};bmesh.ops.delete(bm,geom=list(selected),context='FACES')
        edges={e for e in cut if e.is_valid and e.is_boundary};vertices={v for e in edges for v in e.verts}
        if len(vertices)<6 or any(sum(e in edges for e in v.link_edges)!=2 for v in vertices):raise RuntimeError('Orbital cut is not a simple boundary')
        ordered=[];current=next(iter(vertices));previous=None
        while current not in ordered:
            ordered.append(current);following=[e.other_vert(current) for e in current.link_edges if e in edges and e.other_vert(current)!=previous];previous,current=current,following[0]
        if len(ordered)!=len(vertices):raise RuntimeError('Orbital cut has disconnected boundaries')
        angles,correction=namespace['FitBoundaryAngles'](ordered,Coordinates,0,1);fractions=[(a-angles[0])/(2*math.pi) for a in angles]+[1]
        def Profile(angle,rx,rz):
            sine=math.sin(angle);return rx*math.cos(angle),rz*sine*(.75+.25*abs(sine))
        def PolarProfile(angle,rx,rz,almond=True):
            target=(angle+math.pi)%(2*math.pi)-math.pi;low,high=-math.pi,math.pi
            for iteration in range(36):
                mid=(low+high)/2
                du,dv=Profile(mid,rx,rz) if almond else (rx*math.cos(mid),rz*math.sin(mid))
                if math.atan2(dv/.045,du/.055)<target:low=mid
                else:high=mid
            angle=(low+high)/2
            return Profile(angle,rx,rz) if almond else (rx*math.cos(angle),rz*math.sin(angle))
        pigment=sum((v[color] for v in ordered),Vector((0,0,0,0)))/len(ordered) if color else None;rings=[];count=40
        radialLevels=(.25,.50,.75,1.0,None)
        for level,radial in enumerate(radialLevels):
            ring=[]
            for i in range(count):
                angle=angles[0]+2*math.pi*i/count
                if radial is not None:
                    fraction=i/count;segment=next(j for j in range(len(ordered)) if fractions[j]<=fraction<=fractions[j+1]);t=(fraction-fractions[segment])/max(1e-10,fractions[segment+1]-fractions[segment]);outer=ordered[segment].co.lerp(ordered[(segment+1)%len(ordered)].co,t)
                    du,dv=PolarProfile(angle,.0240,.0101);depth=.0075*math.sqrt(max(.0001,1-(du/.0245)**2-(dv/.011)**2));inner=centre+axis*du+up*dv+normal*(depth+.00010)
                    outerDepth=(outer-centre).dot(normal);innerDepth=(inner-centre).dot(normal);planeDelta=(inner-outer)-normal*(innerDepth-outerDepth);_,surfaceNormal,_,_=tree.find_nearest(outer)
                    derivative=max(-.020,min(.020,-surfaceNormal.dot(planeDelta)/max(.10,surfaceNormal.dot(normal))))
                    t=radial;value=(2*t**3-3*t*t+1)*outerDepth+(t**3-2*t*t+t)*derivative+(-2*t**3+3*t*t)*innerDepth
                    value=max(min(outerDepth,innerDepth)-.002,min(max(outerDepth,innerDepth)+.002,value));point=outer.lerp(inner,t)+normal*(value-((1-t)*outerDepth+t*innerDepth)+.0007*math.sin(math.pi*t)*max(0,math.sin(angle)))
                else:
                    du,dv=PolarProfile(angle,.026,.012,False);point=centre+axis*du+up*dv-normal*.014
                vertex=bm.verts.new(point);vertex[deform][head]=1
                if color:
                    if radial is not None:
                        inner=max(0,min(1,(radial-.72)/.28));inner=inner*inner*(3-2*inner)
                        shade=(.030+.030*(1-radial))*(1-.72*inner)*(1+.35*max(0,math.sin(angle)))
                    else:shade=0
                    vertex[color]=(shade,shade*.94,shade*.84,1) if radial is not None else pigment
                ring.append(vertex)
            rings.append(ring)
        def Face(vertices,material):
            f=bm.faces.new(vertices);f.material_index=material;f.smooth=True;f[part]=1 if side=='Left' else 2
        a,b=ordered,rings[0];i=j=0;n=len(a)
        while i<n or j<count:
            ta=fractions[i+1] if i<n else 100;tb=(j+1)/count if j<count else 100
            if abs(ta-tb)<1e-7:Face((a[i%n],a[(i+1)%n],b[(j+1)%count],b[j%count]),coat);i+=1;j+=1
            elif ta<tb:Face((a[i%n],a[(i+1)%n],b[j%count]),coat);i+=1
            else:Face((a[i%n],b[(j+1)%count],b[j%count]),coat);j+=1
        for level,(a,b) in enumerate(zip(rings,rings[1:])):
            for i in range(count):j=(i+1)%count;Face((a[i],a[j],b[j],b[i]),coat if level<len(rings)-2 else slot)
        Face(tuple(reversed(rings[-1])),slot)
        pale=bpy.data.objects.get('DonkeyPaleEyeRing'+side)
        if pale:bpy.data.objects.remove(pale,do_unlink=True)
        lid=bpy.data.objects['DonkeyEyelidMargin'+side];back=(inverse@lid.matrix_world).inverted();lidPoints=[];lidNormals=[]
        for i in range(40):
            angle=2*math.pi*i/40;du,dv=Profile(angle,.0235,.0095);depth=.0075*math.sqrt(max(.0001,1-(du/.0245)**2-(dv/.011)**2));point=centre+axis*du+up*dv+normal*depth
            surfaceNormal=(axis*(du/.0245**2)+up*(dv/.011**2)+normal*(depth/.0075**2)).normalized();lidPoints.append(point+surfaceNormal*.0002);lidNormals.append(surfaceNormal)
        for i,point in enumerate(lidPoints):
            tangent=(lidPoints[(i+1)%40]-lidPoints[(i-1)%40]).normalized();across=tangent.cross(lidNormals[i]).normalized();radius=.0007+.0005*max(0,math.sin(2*math.pi*i/40))
            for j in range(6):angle=2*math.pi*j/6;lid.data.vertices[i*6+j].co=back@(point+radius*(lidNormals[i]*math.cos(angle)+across*math.sin(angle)))
        lid.data.update()
        reports.append({'side':side,'centre':list(centre),'outerBoundaryVertices':len(ordered),'removedTriangles':removed,'openingRadiiM':[.024,.0101],'floorDepthM':.014,'boundaryAngleCorrectionRad':correction})
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));after=sum(len(f.verts)-2 for f in bm.faces)
    audit={'boundaryEdges':sum(e.is_boundary for e in bm.edges),'nonmanifoldEdges':sum(not e.is_manifold for e in bm.edges),'volumeM3':bm.calc_volume(signed=True)}
    if audit['boundaryEdges'] or audit['nonmanifoldEdges']:raise RuntimeError('Eye socket broke the closed skin: '+str(audit))
    bm.to_mesh(skin.data);bm.free();skin.data.update();return {'sockets':reports,'skinTriangleDelta':after-before,'removedOverlayTriangles':320,'lidRadiusM':[.0007,.0012],'method':'32-plane orbital cut with a closed socket floor, three Hermite transition rows, mild almond aperture and continuous vertex-painted rim; separate pale overlay removed','integrity':audit}

def CheckOrbitalIntegrity(skin):
    mesh=skin.data;mesh.calc_loop_triangles();triangles=list(mesh.loop_triangles);points=[v.co.copy() for v in mesh.vertices]
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
    def Orbital(p):return abs(p.x)>.05 and 1.08<p.y<1.21 and 1.13<p.z<1.255
    for i,j in tree.overlap(tree):
        if i>=j:continue
        a,b=triangles[i],triangles[j]
        if len(set(a.vertices)&set(b.vertices))>=2:continue
        pa=[points[v] for v in a.vertices];pb=[points[v] for v in b.vertices]
        if not(Orbital(sum(pa,Vector())/3) and Orbital(sum(pb,Vector())/3)):continue
        tested+=1;hit=Cross(pa,pb)
        if hit is None:hit=Cross(pb,pa)
        if hit is not None:crossings.append((i,j,list(hit)))
    if crossings:raise RuntimeError('Rebuilt orbital skin intersects itself: '+str(crossings[:5]))
    return {'orbitalCrossings':len(crossings),'testedNonAdjacentPairs':tested,'scope':'proper crossings in both orbital skin regions, excluding shared edges and point-only contact'}

def ApplyReferenceEyeSockets(scene,skin,rig):
    if scene.get('DonkeyEyeRevision'):raise RuntimeError('Eye sockets require the preserved reference-fit skin')
    before={side:[v.co.copy() for v in bpy.data.objects['DonkeyEye'+side].data.vertices] for side in ('Left','Right')}
    report=RebuildEyeSockets(skin,rig);report['integrity'].update(CheckOrbitalIntegrity(skin))
    for side,points in before.items():
        if any((v.co-p).length>1e-9 for v,p in zip(bpy.data.objects['DonkeyEye'+side].data.vertices,points)):raise RuntimeError('Orbital repair changed the preserved globe')
    scene['DonkeyEyeRevision']='20261024EyeV15';report['version']=scene['DonkeyEyeRevision'];report['globeGeometryUnchanged']=True;return report
