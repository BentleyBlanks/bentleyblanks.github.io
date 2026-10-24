"""Remove the inherited tail stub and retain a continuous, closed rump surface."""
import bpy,bmesh,math
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_ray_tri,barycentric_transform

def Smooth(a,b,value):
    t=max(0,min(1,(value-a)/(b-a)));return t*t*(3-2*t)

def RestoreRumpPigment(skin):
    colors=skin.data.color_attributes['CoatColor'];attribute=skin.data.attributes.get('TailRootRepairBlend') or skin.data.attributes.new('TailRootRepairBlend','FLOAT','POINT');samples=[]
    for vertex in skin.data.vertices:
        x,y,z=vertex.co
        if .040<abs(x)<.085 and y<.16 and .48<z<1.08:samples.append((vertex.co.copy(),Vector(colors.data[vertex.index].color[:3])))
    if len(samples)<20:raise RuntimeError('Insufficient intact rump pigment samples')
    changed=0
    for vertex in skin.data.vertices:
        x,y,z=vertex.co;weight=(1-Smooth(.012,.032,abs(x)))*Smooth(.50,.60,z)*(1-Smooth(.99,1.04,z))*(1-Smooth(.12,.22,y));attribute.data[vertex.index].value=weight
        if weight<=0:continue
        nearest=sorted(samples,key=lambda item:(item[0].y-y)**2+(item[0].z-z)**2)[:12];target=Vector(np.median(np.asarray([tuple(c) for p,c in nearest]),axis=0));old=Vector(colors.data[vertex.index].color[:3]);colors.data[vertex.index].color=(*old.lerp(target,weight),1);changed+=1
    return {'vertices':changed,'method':'calibrated neighbouring rump pigment replaces the tail-photo footprint; generic directional fibre detail retained','lateralFullMaskM':.012,'lateralFadeEndM':.032,'heightFadeM':[.50,.60,.99,1.04],'rearFalloffM':[.12,.22]}

def RepairTailRoot(skin,rig):
    tree=BVHTree.FromPolygons([v.co for v in skin.data.vertices],[tuple(f.vertices) for f in skin.data.polygons]);centre=Vector((0,-.10,.91));radiusX,radiusZ=.045,.075
    samples=[];depths=[]
    for x in [-.065,-.050,-.035,-.028,.028,.035,.050,.065]:
        for i in range(15):
            z=.81+.015*i;point,_,_,_=tree.ray_cast(Vector((x,-2,z)),Vector((0,1,0)),3)
            if point is None or not -.18<point.y<-.025:continue
            u=x/radiusX;v=(z-centre.z)/radiusZ;samples.append([1,u,v,u*u,u*v,v*v,v*v*v]);depths.append(point.y)
    if len(samples)<40:raise RuntimeError('Insufficient intact rump samples')
    coefficients=np.linalg.lstsq(np.asarray(samples),np.asarray(depths),rcond=None)[0]
    def SurfaceY(x,z):
        u=x/radiusX;v=(z-centre.z)/radiusZ;return float(np.dot(coefficients,[1,u,v,u*u,u*v,v*v,v*v*v]))
    centre.y=SurfaceY(0,centre.z)
    bm=bmesh.new();bm.from_mesh(skin.data);before=sum(len(f.verts)-2 for f in bm.faces)
    selected={f for f in bm.faces if (lambda p:(p.x/radiusX)**2+((p.z-centre.z)/radiusZ)**2<2.25 and p.y<-.035)(f.calc_center_median())}
    for plane in range(32):
        angle=2*math.pi*plane/32;planePoint=centre+Vector((radiusX*math.cos(angle),0,radiusZ*math.sin(angle)));planeNormal=Vector((math.cos(angle)/radiusX,0,math.sin(angle)/radiusZ)).normalized()
        oldFaces=set(bm.faces);geometry=set(selected)
        for face in selected:geometry.update(face.edges);geometry.update(face.verts)
        bmesh.ops.bisect_plane(bm,geom=list(geometry),dist=1e-7,plane_co=planePoint,plane_no=planeNormal,clear_inner=False,clear_outer=False)
        touched={face for face in selected if face.is_valid}|(set(bm.faces)-oldFaces);selected={face for face in touched if (face.calc_center_median()-planePoint).dot(planeNormal)<1e-7}
    if not selected:raise RuntimeError('Tail-root cut missed the legacy stub')
    namespace={};file=Path(bpy.context.scene['DonkeyCartProject'])/'_blender/Script_DonkeyNasalEnvelope.py';exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),namespace);namespace['CloseBoundaryPinches'](bm,selected)
    removed=sum(len(f.verts)-2 for f in selected);cut={e for f in selected for e in f.edges if any(other not in selected for other in e.link_faces)};bmesh.ops.delete(bm,geom=list(selected),context='FACES');edges={e for e in cut if e.is_valid and e.is_boundary};vertices={v for e in edges for v in e.verts}
    if len(vertices)<8 or any(sum(e in edges for e in v.link_edges)!=2 for v in vertices):raise RuntimeError('Tail-root cut is not a simple boundary')
    ordered=[];current=next(iter(vertices));previous=None
    while current not in ordered:
        ordered.append(current);following=[e.other_vert(current) for e in current.link_edges if e in edges and e.other_vert(current)!=previous];previous,current=current,following[0]
    if len(ordered)!=len(vertices):raise RuntimeError('Tail root has disconnected cut loops')
    def Coordinates(p):return p.x/radiusX,(p.z-centre.z)/radiusZ
    angles,correction=namespace['FitBoundaryAngles'](ordered,Coordinates,0,1);fractions=[(angle-angles[0])/(2*math.pi) for angle in angles]+[1]
    deform=bm.verts.layers.deform.verify();color=bm.verts.layers.float_color.get('CoatColor');material=next(i for i,m in enumerate(skin.data.materials) if m.name.startswith('DonkeyCartGreyCoat'));averageColor=sum((v[color] for v in ordered),Vector((0,0,0,0)))/len(ordered) if color else None
    averageWeights={}
    for vertex in ordered:
        for group,weight in vertex[deform].items():averageWeights[group]=averageWeights.get(group,0)+weight/len(ordered)
    def New(point,row,pigment):
        vertex=bm.verts.new(point);row=dict(sorted(row.items(),key=lambda item:-item[1])[:4]);total=sum(row.values())
        for group,weight in row.items():vertex[deform][group]=weight/total
        if color:vertex[color]=pigment
        return vertex
    rings=[];count=40
    for radial in [.80,.60,.40,.20]:
        ring=[];t=1-radial
        for i in range(count):
            fraction=i/count;segment=next(j for j in range(len(ordered)) if fractions[j]<=fraction<=fractions[j+1]);blend=(fraction-fractions[segment])/max(1e-10,fractions[segment+1]-fractions[segment]);a,b=ordered[segment],ordered[(segment+1)%len(ordered)];outer=a.co.lerp(b.co,blend);_,normal,_,_=tree.find_nearest(outer)
            delta=centre-outer;denominator=normal.y if abs(normal.y)>.15 else (-.15 if normal.y<0 else .15);d0=-(normal.x*delta.x+normal.z*delta.z)/denominator;d0=max(-.05,min(.05,d0));d1=coefficients[1]*delta.x/radiusX+coefficients[2]*delta.z/radiusZ
            y=(2*t**3-3*t*t+1)*outer.y+(t**3-2*t*t+t)*d0+(-2*t**3+3*t*t)*centre.y+(t**3-t*t)*d1;point=outer.lerp(centre,t);point.y=y
            outerWeights={group:a[deform].get(group,0)*(1-blend)+b[deform].get(group,0)*blend for group in set(a[deform].keys())|set(b[deform].keys())};weights={group:outerWeights.get(group,0)*radial+averageWeights.get(group,0)*t for group in set(outerWeights)|set(averageWeights)};pigment=a[color].lerp(b[color],blend).lerp(averageColor,t) if color else None;ring.append(New(point,weights,pigment))
        rings.append(ring)
    def Face(vertices):
        face=bm.faces.new(vertices);face.material_index=material;face.smooth=True
    a,b=ordered,rings[0];i=j=0;n=len(a)
    while i<n or j<count:
        ta=fractions[i+1] if i<n else 100;tb=(j+1)/count if j<count else 100
        if abs(ta-tb)<1e-7:Face((a[i%n],a[(i+1)%n],b[(j+1)%count],b[j%count]));i+=1;j+=1
        elif ta<tb:Face((a[i%n],a[(i+1)%n],b[j%count]));i+=1
        else:Face((a[i%n],b[(j+1)%count],b[j%count]));j+=1
    for a,b in zip(rings,rings[1:]):
        for i in range(count):j=(i+1)%count;Face((a[i],a[j],b[j],b[i]))
    point=New(centre,averageWeights,averageColor)
    for i in range(count):Face((rings[-1][i],rings[-1][(i+1)%count],point))
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));after=sum(len(f.verts)-2 for f in bm.faces);audit={'boundaryEdges':sum(e.is_boundary for e in bm.edges),'nonmanifoldEdges':sum(not e.is_manifold for e in bm.edges),'volumeM3':bm.calc_volume(signed=True)}
    if audit['boundaryEdges'] or audit['nonmanifoldEdges']:raise RuntimeError('Tail-root repair damaged closed skin')
    bm.to_mesh(skin.data);bm.free();skin.data.update();return {'method':'legacy stub removed by elliptical-prism cut; continuous Hermite rump patch from intact lateral surface samples','centre':list(centre),'radiiM':[radiusX,radiusZ],'sampleCount':len(samples),'boundaryVertices':len(ordered),'removedTriangles':removed,'skinTriangleDelta':after-before,'boundaryAngleCorrectionRad':correction,'integrity':audit}

def RemoveOccludedChannel(skin):
    namespace={};file=Path(bpy.context.scene['DonkeyCartProject'])/'_blender/Script_DonkeyTopology.py';exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),namespace)
    bm=bmesh.new();bm.from_mesh(skin.data);components=list(namespace['FaceComponents'](bm));main=max(components,key=len);vertices=list({v for f in main for v in f.verts});lookup={v:i for i,v in enumerate(vertices)};tree=BVHTree.FromPolygons([v.co for v in vertices],[tuple(lookup[v] for v in f.verts) for f in main]);reports=[]
    directions=[]
    for i in range(48):
        z=1-2*(i+.5)/48;angle=i*math.pi*(3-math.sqrt(5));directions.append(Vector((math.sqrt(1-z*z)*math.cos(angle),math.sqrt(1-z*z)*math.sin(angle),z)))
    for faces in components:
        points=[v.co.copy() for v in {v for f in faces for v in f.verts}]
        if not(100<len(faces)<1000 and all(abs(p.x)<.06 and 1.0<p.y<1.215 and .90<p.z<1.15 for p in points)):continue
        visible=0;cover=10
        for point in points:
            for direction in directions:
                hit,_,_,distance=tree.ray_cast(point+direction*2,-direction,2.1)
                if hit is None or distance>=1.9999:visible+=1
                else:cover=min(cover,2-distance)
        if visible:raise RuntimeError('Legacy channel is not fully hidden from the sampled exterior directions')
        report={'faces':len(faces),'triangles':sum(len(f.verts)-2 for f in faces),'vertices':len(points),'testedRays':len(points)*48,'unoccludedVertexRays':visible,'minimumSkinCoverM':cover};bmesh.ops.delete(bm,geom=list(faces),context='FACES');reports.append(report)
    if len(reports)!=1:raise RuntimeError('Expected exactly one occluded legacy head channel')
    bm.to_mesh(skin.data);bm.free();skin.data.update();return reports[0]

def CheckTrunkIntegrity(skin):
    mesh=skin.data;mesh.calc_loop_triangles();triangles=list(mesh.loop_triangles);points=[v.co.copy() for v in mesh.vertices];tree=BVHTree.FromPolygons(points,[tuple(t.vertices) for t in triangles],all_triangles=True);crossings=[];tested=0
    def Cross(a,b):
        for p,q in zip(a,a[1:]+a[:1]):
            direction=q-p;hit=intersect_ray_tri(*b,direction,p,True)
            if hit is None:continue
            fraction=(hit-p).dot(direction)/max(1e-15,direction.length_squared)
            if not 1e-4<fraction<1-1e-4:continue
            bary=barycentric_transform(hit,*b,Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1)))
            if min(bary)>1e-4:return hit
        return None
    def Trunk(p):return -.24<p.y<.88 and .72<p.z<1.16
    for i,j in tree.overlap(tree):
        if i>=j:continue
        a,b=triangles[i],triangles[j]
        if len(set(a.vertices)&set(b.vertices))>=2:continue
        pa=[points[v] for v in a.vertices];pb=[points[v] for v in b.vertices]
        if not(Trunk(sum(pa,Vector())/3) and Trunk(sum(pb,Vector())/3)):continue
        tested+=1;hit=Cross(pa,pb)
        if hit is None:hit=Cross(pb,pa)
        if hit is not None:crossings.append((i,j,list(hit)))
    if crossings:raise RuntimeError('Repaired trunk still intersects itself: '+str(crossings[:5]))
    return {'trunkCrossings':len(crossings),'testedNonAdjacentPairs':tested,'scope':'proper trunk-skin crossings; shared edges and point-only contacts excluded'}

def ApplyReferenceTailRoot(scene,skin,rig):
    if scene.get('DonkeyTailRootRevision'):raise RuntimeError('Tail-root recipe requires the original fitted skin')
    report=RepairTailRoot(skin,rig);report['hiddenChannel']=RemoveOccludedChannel(skin);report['pigmentRepair']=RestoreRumpPigment(skin)
    bm=bmesh.new();bm.from_mesh(skin.data);report['integrity'].update({'boundaryEdges':sum(e.is_boundary for e in bm.edges),'nonmanifoldEdges':sum(not e.is_manifold for e in bm.edges),'volumeM3':bm.calc_volume(signed=True)});bm.free()
    report['integrity'].update(CheckTrunkIntegrity(skin));scene['DonkeyTailRootRevision']='20261024TailRootV17';report['version']=scene['DonkeyTailRootRevision'];return report
