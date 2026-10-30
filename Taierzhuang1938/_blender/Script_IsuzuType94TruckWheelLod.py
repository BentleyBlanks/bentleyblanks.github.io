"""Current-source tyre, pressing and support-tube runtime sampling. No historical GLB dependency."""
import bpy,math
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import delaunay_2d_cdt,barycentric_transform

def SourcePart(obj):
    deps=bpy.context.evaluated_depsgraph_get();ev=obj.evaluated_get(deps);mesh=ev.to_mesh();mesh.calc_loop_triangles();matrix=obj.matrix_world;normalMatrix=matrix.to_3x3().inverted().transposed();triangles=[]
    for tri in mesh.loop_triangles:
        triangles.append({'p':[matrix@mesh.vertices[i].co for i in tri.vertices],'n':[(normalMatrix@mesh.corner_normals[li].vector).normalized() for li in tri.loops],'uv':[mesh.uv_layers.active.data[li].uv.copy() for li in tri.loops],'indices':list(tri.vertices),'polygon':tri.polygon_index})
    normals=[None]*len(mesh.vertices)
    for loop,n in zip(mesh.loops,mesh.corner_normals):normals[loop.vertex_index]=(normalMatrix@n.vector).normalized()
    result={'p':[matrix@v.co for v in mesh.vertices],'n':normals,'triangles':triangles,'centre':obj.parent.matrix_world.translation.copy(),'front':obj.get('PressedDiscFrontTriangles')};ev.to_mesh_clear();return result

def NewRecipe():return {'vertices':[],'faces':[],'normals':[],'uvs':[],'smooth':[]}
def AddTriangle(recipe,points,normals,uvs,smooth=True):
    first=len(recipe['vertices']);recipe['vertices'].extend(tuple(p) for p in points);recipe['normals'].extend(tuple(n) for n in normals);recipe['uvs'].extend(tuple(v) for v in uvs);recipe['faces'].append((first,first+1,first+2));recipe['smooth'].append(smooth)
def FlatTriangle(recipe,points,tile=.35):
    normal=(points[1]-points[0]).cross(points[2]-points[0]).normalized();axis=max(range(3),key=lambda k:abs(normal[k]));uvs=[((p.y,p.z) if axis==0 else (p.x,p.z) if axis==1 else (p.x,p.y)) for p in points];AddTriangle(recipe,points,[normal]*3,[(u/tile,v/tile) for u,v in uvs],False)

def TyreRecipe(source):
    assert len(source['p'])==13*112
    selected=[[row*112+k*4 for k in range(28)] for row in range(13)];centre=source['centre'];profile=[Vector((source['p'][row*112].x,math.hypot(source['p'][row*112].y-centre.y,source['p'][row*112].z-centre.z))) for row in range(13)];arc=[0.]
    for a,b in zip(profile,profile[1:]):arc.append(arc[-1]+(b-a).length)
    out=NewRecipe()
    for row in range(13):
        other=(row+1)%13
        for k in range(28):
            j=(k+1)%28;ids=[selected[row][k],selected[row][j],selected[other][j],selected[other][k]];v0=arc[row]/.35;v1=(arc[other] if other else arc[-1]+(profile[-1]-profile[0]).length)/.35;uv=[(8*k/28,v0),(8*(k+1)/28,v0),(8*(k+1)/28,v1),(8*k/28,v1)]
            for face in [(0,1,2),(0,2,3)]:AddTriangle(out,[source['p'][ids[i]] for i in face],[source['n'][ids[i]] for i in face],[uv[i] for i in face])
    assert len(out['faces'])==728
    return out

def TreadRecipe(source,tyre):
    out=NewRecipe();tree=BVHTree.FromPolygons([Vector(p) for p in tyre['vertices']],tyre['faces'],all_triangles=True);centre=source['centre'];tops={}
    for tri in source['triangles']:
        if all(i%8>=4 for i in tri['indices']):tops.setdefault(tri['indices'][0]//8,[]).append(tri)
    assert len(tops)==162
    for lug in range(162):
        points=source['p'][lug*8+4:lug*8+8];mid=sum(points,Vector())/4;radial=Vector((0,mid.y-centre.y,mid.z-centre.z)).normalized();hit=tree.ray_cast(mid+radial*.1,-radial,.3)[0]
        if hit is None:raise RuntimeError('Runtime tread misses sampled carcass')
        apex=hit-radial*.0015
        for tri in tops[lug]:AddTriangle(out,tri['p'],tri['n'],tri['uv'],False)
        for k in range(4):FlatTriangle(out,[points[(k+1)%4],points[k],apex])
    assert len(out['faces'])==972
    return out

def SurfaceSampler(triangles):
    tree=BVHTree.FromPolygons([p for tri in triangles for p in tri['p']],[tuple(range(i*3,i*3+3)) for i in range(len(triangles))],all_triangles=True)
    def Sample(point):
        hit=tree.find_nearest(point)
        if hit[0] is None:raise RuntimeError('Missing pressing source surface')
        tri=triangles[hit[2]];a,b,c=tri['p'];normal=barycentric_transform(hit[0],a,b,c,*tri['n']).normalized();uv=barycentric_transform(hit[0],a,b,c,*[Vector((u.x,u.y,0)) for u in tri['uv']]);return hit[0],normal,(uv.x,uv.y)
    return Sample

def DiscRecipe(source,frontHeight=None,thicknessM=.0024384):
    front=[tri for tri in source['triangles'] if tri['polygon']<source['front']];back=[tri for tri in source['triangles'] if source['front']<=tri['polygon']<2*source['front']];sampleFront=SurfaceSampler(front);sampleBack=SurfaceSampler(back);half=len(source['p'])//2;centre=source['centre'];edgeCounts={}
    # Raw source indices are recovered from exact coordinate keys,independent
    # of exporter corner splits. Every boundary belongs to the source pressing.
    index={tuple(round(v,7) for v in p):i for i,p in enumerate(source['p'][:half])}
    for tri in front:
        ids=[index[tuple(round(v,7) for v in p)] for p in tri['p']]
        for a,b in zip(ids,ids[1:]+ids[:1]):key=tuple(sorted((a,b)));edgeCounts[key]=edgeCounts.get(key,0)+1
    graph={}
    for (a,b),count in edgeCounts.items():
        if count==1:graph.setdefault(a,[]).append(b);graph.setdefault(b,[]).append(a)
    assert all(len(n)==2 for n in graph.values());remaining=set(graph);loops=[]
    while remaining:
        start=min(remaining);loop=[start];previous=None;current=start
        while True:
            nextVertex=next(v for v in graph[current] if v!=previous)
            if nextVertex==start:break
            loop.append(nextVertex);previous,current=current,nextVertex
        remaining-=set(loop);loops.append(loop)
    assert sorted(map(len,loops))==[24]*8+[32,64]
    outer=next(l for l in loops if len(l)==64);inner=next(l for l in loops if len(l)==32);holes=[l for l in loops if len(l)==24];points=[];boundaries=[]
    def Circle(loop,count):
        records=sorted([(math.atan2(source['p'][i].z-centre.z,source['p'][i].y-centre.y)%(2*math.pi),source['p'][i]) for i in loop],key=lambda v:v[0]);out=[]
        for k in range(count):
            angle=k*2*math.pi/count;a,p0=max((r for r in records if r[0]<=angle+1e-6),key=lambda r:r[0],default=records[-1]);b,p1=records[(records.index((a,p0))+1)%len(records)]
            if b<a:b+=2*math.pi
            target=angle if angle>=a-1e-6 else angle+2*math.pi;t=(target-a)/(b-a);out.append(p0.lerp(p1,max(0,min(1,t))))
        return out
    def AddLoop(values):
        boundary=[]
        for p in values:boundary.append(len(points));points.append(Vector((p.y,p.z)))
        boundaries.append(boundary)
    AddLoop(Circle(outer,16));AddLoop(Circle(inner,8))
    factor=2/(1+math.cos(math.pi/12))
    for loop in holes:
        mid=sum((source['p'][i] for i in loop),Vector())/len(loop);ordered=sorted(loop,key=lambda i:math.atan2(source['p'][i].z-mid.z,source['p'][i].y-mid.y));chosen=ordered[::2];AddLoop([mid+(source['p'][i]-mid)*factor for i in chosen])
    # CDT receives CCW loops for the hole-containment predicate.
    for loop in boundaries:
        area=sum(points[a].x*points[b].y-points[b].x*points[a].y for a,b in zip(loop,loop[1:]+loop[:1]))
        if area<0:loop.reverse()
    edges=[(a,b) for loop in boundaries for a,b in zip(loop,loop[1:]+loop[:1])];vertices,_,faces,_,_,_=delaunay_2d_cdt(points,edges,[],0,1e-7,False)
    def Inside(point,loop):return all((points[b]-points[a]).cross(point-points[a])>=-1e-8 for a,b in zip(loop,loop[1:]+loop[:1]))
    faces=[tuple(f) for f in faces if not any(Inside(sum((vertices[i] for i in f),Vector((0,0)))/3,loop) for loop in boundaries[1:])];sign=1 if sum(tri['n'][0].x for tri in front)>0 else -1
    if sign<0:faces=[tuple(reversed(f)) for f in faces]
    frontRecords=[];backRecords=[]
    meanX=sum(p.x for tri in front for p in tri['p'])/(len(front)*3)
    for v in vertices:
        fp,fn,fu=sampleFront(Vector((meanX,v.x,v.y)));bp,bn,bu=sampleBack(Vector((fp.x,v.x,v.y)));fx=fp.x;bx=bp.x
        if frontHeight:
            fx=centre.x+sign*frontHeight(math.hypot(v.x-centre.y,v.y-centre.z));bx=fx-sign*thicknessM
        frontRecords.append((Vector((fx,v.x,v.y)),fn,fu));backRecords.append((Vector((bx,v.x,v.y)),bn,bu))
    out=NewRecipe();counts={};directions={}
    for face in faces:
        AddTriangle(out,[frontRecords[i][0] for i in face],[frontRecords[i][1] for i in face],[frontRecords[i][2] for i in face]);other=tuple(reversed(face));AddTriangle(out,[backRecords[i][0] for i in other],[backRecords[i][1] for i in other],[backRecords[i][2] for i in other])
        for a,b in zip(face,face[1:]+face[:1]):key=tuple(sorted((a,b)));counts[key]=counts.get(key,0)+1;directions[key]=(a,b)
    for key,count in counts.items():
        if count!=1:continue
        a,b=directions[key];quad=[frontRecords[b][0],frontRecords[a][0],backRecords[a][0],backRecords[b][0]];FlatTriangle(out,[quad[i] for i in [0,1,2]],.75);FlatTriangle(out,[quad[i] for i in [0,2,3]],.75)
    assert len(out['faces'])==512,(len(vertices),len(out['faces']))
    return out

def SeatTreadBase(tread,tyre,overlapM=.0015):
    """Seat all high-source base corners without moving the four top corners."""
    bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();ev=tyre.evaluated_get(deps);mesh=ev.to_mesh();mesh.calc_loop_triangles();tree=BVHTree.FromPolygons([tyre.matrix_world@v.co for v in mesh.vertices],[tuple(t.vertices) for t in mesh.loop_triangles],all_triangles=True);ev.to_mesh_clear();centre=tread.parent.matrix_world.translation;matrix=tread.matrix_world.copy();inverse=matrix.inverted()
    if len(tread.data.vertices)!=162*8:raise RuntimeError('Unexpected authored tread layout')
    for lug in range(162):
        for k in range(4):
            vertex=tread.data.vertices[lug*8+k];point=matrix@vertex.co;radial=Vector((0,point.y-centre.y,point.z-centre.z)).normalized();hit=tree.ray_cast(point+radial*.1,-radial,.2)[0]
            if hit is None:raise RuntimeError('High-source tread base misses actual carcass')
            vertex.co=inverse@(hit-radial*overlapM)
    tread.data.update();tread['CarcassBaseOverlapM']=overlapM;tread['CarcassBasePlacement']='All648base corners seated inside the actual high-source carcass;648top corners and their photographic envelope retained. Pattern and overlap are reconstruction.'

def TubeRows(source,positionTolerance=.0005,normalDegrees=2):
    """Shortest source-ring subset with bounded position and normal error."""
    p=np.array([tuple(v) for v in source['p']],dtype=float).reshape(-1,8,3);n=np.array([tuple(v) for v in source['n']],dtype=float).reshape(-1,8,3);count=len(p);cost=[float('inf')]*count;cost[0]=0;previous=[None]*count;errors={}
    def Error(a,b):
        if b==a+1:return (0.,0.)
        delta=p[b]-p[a];alpha=np.clip(np.sum((p[a:b+1]-p[a])*delta,axis=2)/np.sum(delta*delta,axis=1),0,1);actual=p[a]+alpha[:,:,None]*delta;position=float(np.max(np.linalg.norm(actual-p[a:b+1],axis=2)))
        if position>positionTolerance:return(position,180.)
        normal=n[a][None,:,:]*(1-alpha[:,:,None])+n[b][None,:,:]*alpha[:,:,None];normal/=np.linalg.norm(normal,axis=2)[:,:,None];angle=float(np.max(np.arccos(np.clip(np.sum(normal*n[a:b+1],axis=2),-1,1)))*180/math.pi);return(position,angle)
    for b in range(1,count):
        for a in range(b):
            if cost[a]+1>=cost[b]:continue
            error=Error(a,b)
            if error[0]<=positionTolerance and error[1]<=normalDegrees:cost[b]=cost[a]+1;previous[b]=a;errors[(a,b)]=error
    rows=[count-1]
    while rows[-1]:rows.append(previous[rows[-1]])
    rows.reverse();selected=[errors[(a,b)] for a,b in zip(rows,rows[1:])]
    return rows,{'sourceRows':count,'retainedRows':rows,'maximumPositionErrorM':max(e[0] for e in selected),'maximumNormalErrorDegrees':max(e[1] for e in selected),'positionToleranceM':positionTolerance,'normalToleranceDegrees':normalDegrees,'uvMethod':'Physical cross-section perimeter and source centreline arc length;0.75m tile. Source UVs remain untouched.'}

def SampleSurfaces(sourceMeshes,originalNames,build):
    objects={originalNames[o]:o for o in sourceMeshes};recipes={};metrics={};wheelNames=['SpareWheel']+['Wheel_'+a+b for a in ['Front','Rear1','Rear2'] for b in ['Left','Right']]
    for name in wheelNames:
        tyre=TyreRecipe(SourcePart(objects[name+'_Tyre']));recipes[name+'_Tyre']=tyre;recipes[name+'_TreadLugs']=TreadRecipe(SourcePart(objects[name+'_TreadLugs']),tyre);recipes[name+'_PerforatedDisc']=DiscRecipe(SourcePart(objects[name+'_PerforatedDisc']),lambda r:build.PressedDiscProfile(r/(.2864/.266))*(.1524/.25))
    recipes['SpareWheel_InnerDisc']=SimpleRing(SourcePart(objects['SpareWheel_InnerDisc']),samples=16)
    for name,obj in objects.items():
        if not name.startswith('Cargo_CanvasBow'):continue
        source=SourcePart(obj);rows,metric=TubeRows(source);recipes[name]=TubeRecipe(source,rows);metrics[name]=metric
    if len(recipes)!=26:raise RuntimeError('Expected26current-source wheel/tube runtime recipes')
    return recipes,metrics

def MakeTreadBudgetProxy(obj,build):
    """Recreate former pre-seat inputs only to isolate global collapse choices.

    This proxy is discarded. Actual seated current-source top triangles and
    closed supported runtime lugs are installed after budget reduction.
    """
    x,y,z=obj.parent['SourceWheelRawCentreM'];vertices=[];faces=[]
    for step in range(54):
        for lane in range(3):
            angle=math.tau*(step+(lane%2)*.45)/54;xc=(lane-1)*.066
            for dx,da,dr in [(-.030,-.030,0),(-.030,.030,0),(.030,.030,0),(.030,-.030,0),(-.028,-.029,.012),(-.028,.029,.012),(.028,.029,.012),(.028,-.029,.012)]:
                a=angle+da+dx*.48*(-1 if lane==0 else 1);r=.433+dr-.012*(abs(xc)/.1)**2;vertices.append((x+xc+dx,y+r*math.cos(a),z+r*math.sin(a)))
            first=len(vertices)-8;faces.extend(tuple(first+i for i in f) for f in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
    temp=build.Mesh('RuntimeTreadBudgetProxy',vertices,faces,'Rubber',None);temp.matrix_world=obj.matrix_world.copy()
    for vertex in temp.data.vertices:
        point=vertex.co;point.x=x+(point.x-x)*(.1524/.25);yy=point.y-y;zz=point.z-z;radius=math.hypot(yy,zz)
        if radius>1e-8:
            newRadius=.2794+(radius-.245)*(.4318-.2794)/(.445-.245);point.y=y+yy*newRadius/radius;point.z=z+zz*newRadius/radius
    build.AssignUV([temp]);tri=temp.modifiers.new('ExportTriangulation','TRIANGULATE');tri.keep_custom_normals=True;bpy.context.view_layer.update();ev=temp.evaluated_get(bpy.context.evaluated_depsgraph_get());evaluated=ev.to_mesh();mesh=evaluated.copy();ev.to_mesh_clear();old=temp.data;bpy.data.objects.remove(temp,do_unlink=True);bpy.data.meshes.remove(old);result=bpy.data.objects.new('RuntimeReduction',mesh);bpy.context.collection.objects.link(result);result.matrix_world=obj.matrix_world.copy();return result

def SimpleRing(source,sections=4,circumference=80,samples=8):
    out=NewRecipe();assert len(source['p'])==sections*circumference
    # Same source-side UV selection rule as existing analytical collars.
    for row in range(sections):
        other=(row+1)%sections
        for k in range(samples):
            j=(k+1)%samples;ids=[row*circumference+k*(circumference//samples),row*circumference+j*(circumference//samples),other*circumference+j*(circumference//samples),other*circumference+k*(circumference//samples)]
            a,b,c=[source['p'][ids[i]] for i in [0,1,2]];normal=(b-a).cross(c-a);average=sum((source['n'][i] for i in ids),Vector());faces=[(0,1,2),(0,2,3)] if normal.dot(average)>0 else [(2,1,0),(3,2,0)]
            for face in faces:
                ps=[source['p'][ids[i]] for i in face];ns=[source['n'][ids[i]] for i in face];n=(ps[1]-ps[0]).cross(ps[2]-ps[0]);axis=max(range(3),key=lambda i:abs(n[i]));uv=[((p.y/.75,p.z/.75) if axis==0 else (p.x/.75,p.z/.75) if axis==1 else (p.x/.75,p.y/.75)) for p in ps];AddTriangle(out,ps,ns,uv)
    return out

def ConformSpareCarrier(root):
    """Seat low bar/nut on the actual sampled collar without changing source."""
    names={int(k):v for k,v in root['SourcePartNames'].items()};wanted={'SpareCarrier_LockingBar','SpareCarrier_LockingNut'};deps=bpy.context.evaluated_depsgraph_get();objects=[]
    # Read the real final collapse result before the contact adjustment.
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        attr=obj.data.attributes.get('_SOURCE_PART_ID')
        if attr is None or not any(names[int(round(v.value))] in wanted for v in attr.data):continue
        ev=obj.evaluated_get(deps);evaluated=ev.to_mesh();normals=[tuple(n.vector) for n in evaluated.corner_normals];mesh=evaluated.copy();ev.to_mesh_clear();old=obj.data;obj.modifiers.clear();obj.data=mesh;mesh.normals_split_custom_set(normals);bpy.data.meshes.remove(old);objects.append(obj)
    bpy.context.view_layer.update();parts={}
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        attr=obj.data.attributes.get('_SOURCE_PART_ID')
        if attr is None:continue
        for face in obj.data.polygons:
            name=names[int(round(attr.data[face.vertices[0]].value))]
            if name not in wanted|{'SpareWheel_InnerDisc'}:continue
            part=parts.setdefault(name,{'points':[],'faces':[],'vertices':{}});first=len(part['points']);part['points'].extend(obj.matrix_world@obj.data.vertices[i].co for i in face.vertices);part['faces'].append(tuple(range(first,first+len(face.vertices))));part['vertices'].setdefault(obj,set()).update(face.vertices)
    if set(parts)!=wanted|{'SpareWheel_InnerDisc'}:raise RuntimeError('Missing final spare contact parts')
    collar=parts['SpareWheel_InnerDisc'];tree=BVHTree.FromPolygons(collar['points'],collar['faces'],all_triangles=False);bar=parts['SpareCarrier_LockingBar'];back=min(p.x for p in bar['points']);deltas=[]
    for point in [p for p in bar['points'] if abs(p.x-back)<1e-6]:
        hit=tree.ray_cast(Vector((1.2,point.y,point.z)),Vector((-1,0,0)),.6)[0]
        if hit is not None:deltas.append(hit.x-point.x)
    if len(deltas)<4:raise RuntimeError('Sampled spare collar does not support locking bar')
    shift=max(deltas)
    if abs(shift)>.001:raise RuntimeError('Spare runtime seating adjustment exceeds1mm')
    selected={}
    for name in wanted:
        for obj,indices in parts[name]['vertices'].items():selected.setdefault(obj,set()).update(indices)
    for obj,indices in selected.items():
        mesh=obj.data;normals=[tuple(n.vector) for n in mesh.corner_normals];delta=obj.matrix_world.inverted().to_3x3()@Vector((shift,0,0))
        for i in indices:mesh.vertices[i].co+=delta
        mesh.update();uv=mesh.uv_layers.active
        for face in mesh.polygons:
            if not all(i in indices for i in face.vertices):continue
            points=[obj.matrix_world@mesh.vertices[i].co for i in face.vertices];normal=(points[1]-points[0]).cross(points[2]-points[0]);axis=max(range(3),key=lambda k:abs(normal[k]))
            for li,p in zip(face.loop_indices,points):uv.data[li].uv=((p.y/.35,p.z/.35) if axis==0 else (p.x/.35,p.z/.35) if axis==1 else (p.x/.35,p.y/.35))
        mesh.normals_split_custom_set(normals)
    root['RuntimeSpareCollarStations']=16;root['RuntimeSpareCarrierContactFitM']=shift
    root['RuntimeSpareCarrierContactMethod']='Sixteen-station current-source collar;actual evaluated low locking-bar back feet ray-seated with at most1mm rigid axial offset. Nut follows bar;physical steel UVs refreshed only on these two parts. Source hardware retained.'
    return {'barAndNutShiftM':shift,'sourceUnchanged':True,'collarStations':16}


def TubeRecipe(source,rows,segments=8):
    out=NewRecipe();p=source['p'];n=source['n'];centres=[sum(p[i:i+segments],Vector())/segments for i in range(0,len(p),segments)];arc=[0.]
    for a,b in zip(centres,centres[1:]):arc.append(arc[-1]+(b-a).length)
    for a,b in zip(rows,rows[1:]):
        for k in range(segments):
            j=(k+1)%segments;ids=[a*segments+k,a*segments+j,b*segments+j,b*segments+k];radius=sum((p[a*segments+t]-centres[a]).length for t in range(segments))/segments;uv=[(2*math.pi*radius*k/segments/.75,arc[a]/.75),(2*math.pi*radius*(k+1)/segments/.75,arc[a]/.75),(2*math.pi*radius*(k+1)/segments/.75,arc[b]/.75),(2*math.pi*radius*k/segments/.75,arc[b]/.75)]
            for face in [(0,1,2),(0,2,3)]:AddTriangle(out,[p[ids[i]] for i in face],[n[ids[i]] for i in face],[uv[i] for i in face])
    for row,reverse in [(rows[0],True),(rows[-1],False)]:
        ids=list(range(row*segments,(row+1)*segments));ids=ids[::-1] if reverse else ids
        for k in range(1,segments-1):
            face=[ids[0],ids[k],ids[k+1]];ps=[p[i] for i in face];uv=[(v.x/.75,v.y/.75) for v in ps];AddTriangle(out,ps,[n[i] for i in face],uv)
    return out


def CappedCylinderRecipe(source,samples=16,circumference=48):
    if len(source['p'])!=2*circumference or len(source['triangles'])!=4*circumference-4 or circumference%samples:raise RuntimeError('Unexpected source wheel-boss cylinder')
    caps=[[tri for tri in source['triangles'] if all(layer*circumference<=i<(layer+1)*circumference for i in tri['indices'])] for layer in range(2)];sides=[tri for tri in source['triangles'] if not any(all(layer*circumference<=i<(layer+1)*circumference for i in tri['indices']) for layer in range(2))]
    if list(map(len,caps))!=[circumference-2]*2 or len(sides)!=2*circumference:raise RuntimeError('Wheel-boss source shell changed')
    def Corner(index,triangles,segment=None):
        candidates=[tri for tri in triangles if index in tri['indices'] and (segment is None or {i%circumference for i in tri['indices']}=={segment,(segment+1)%circumference})]
        if not candidates:raise RuntimeError('Missing source wheel-boss corner')
        tri=candidates[0];k=tri['indices'].index(index);return source['p'][index],tri['n'][k],tri['uv'][k]
    out=NewRecipe();step=circumference//samples
    for layer in range(2):
        ids=[layer*circumference+k*step for k in range(samples)];ids=ids[::-1] if layer==0 else ids
        for k in range(1,samples-1):
            values=[Corner(i,caps[layer]) for i in [ids[0],ids[k],ids[k+1]]];AddTriangle(out,[v[0] for v in values],[v[1] for v in values],[v[2] for v in values],False)
    for k in range(samples):
        a=k*step;b=((k+1)*step)%circumference;ids=[a,b,b+circumference,a+circumference];values=[Corner(index,sides,a if j in [0,3] else (b-1)%circumference) for j,index in enumerate(ids)]
        for face in [(0,1,2),(0,2,3)]:AddTriangle(out,[values[i][0] for i in face],[values[i][1] for i in face],[values[i][2] for i in face])
    centre=sum(source['p'],Vector())/len(source['p']);radius=max(math.hypot(p.y-centre.y,p.z-centre.z) for p in source['p']);bound=radius*(math.cos(math.pi/circumference)-math.cos(math.pi/samples))
    return out,{'sourceTriangles':len(source['triangles']),'runtimeTriangles':len(out['faces']),'sourceCircumference':circumference,'retainedCircumference':samples,'maximumCrossSectionDifferenceBoundM':bound,'sourceAxialBoundsRetained':True,'sourceNormalsAndCornerUvsSampled':True}


def SampleHardware(sourceMeshes,originalNames):
    recipes={};metrics={}
    for obj in sourceMeshes:
        name=originalNames[obj]
        if not name.startswith('Wheel_'):continue
        if '_Lug' in name or name.endswith('_HubCap'):
            source=SourcePart(obj);recipe=NewRecipe();ev=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh();flags=[p.use_smooth for p in mesh.polygons];ev.to_mesh_clear()
            if len(source['triangles'])!=20:raise RuntimeError('Expected full20triangle source wheel nut')
            for tri in source['triangles']:AddTriangle(recipe,tri['p'],tri['n'],tri['uv'],flags[tri['polygon']])
            recipes[name]=recipe
            if name.endswith('_HubCap'):metrics[name]={'sourceTriangles':20,'runtimeTriangles':20,'sourceCornerRadiusM':.056,'sourceCircumference':6,'retainedCircumference':6,'maximumCrossSectionDifferenceBoundM':0,'sourceAxialBoundsRetained':True,'sourceNormalsAndCornerUvsSampled':True,'outline':'Full source six-flat central cover;scan-derived size,not printed manufacturing dimension'}
        elif name.endswith(('_Hub','_HubCap')):
            recipes[name],metrics[name]=CappedCylinderRecipe(SourcePart(obj))
    if len(recipes)!=60 or len(metrics)!=12:raise RuntimeError('Expected48nuts and12wheel bosses')
    return recipes,metrics
