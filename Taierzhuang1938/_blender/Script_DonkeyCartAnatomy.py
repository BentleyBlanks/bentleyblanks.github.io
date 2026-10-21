"""Fit the retained upper forelimb surface to the donkey's physical joints."""
import math,json
from mathutils import Vector

def Smooth(a,b,value):
    t=max(0,min(1,(value-a)/(b-a)));return t*t*(3-2*t)

def Interpolate(rows,z,column):
    for a,b in zip(rows,rows[1:]):
        if a[0]<=z<=b[0]:return a[column]+(b[column]-a[column])*(z-a[0])/(b[0]-a[0])
    return rows[0 if z<rows[0][0] else -1][column]

def RefitUpperForelimbs(points,sourceRows,origins,faces):
    original=[p.copy() for p in points];records=[]
    profile=[(.53,.029,.033),(.60,.033,.040),(.66,.040,.047),(.72,.048,.055),(.78,.063,.067),(.86,.085,.095),(.91,.105,.110)]
    for side,sign in (('Left',-1),('Right',1)):
        stem='DonkeyFront'+side;source='HorseFront'+side
        masses=[sum(w for name,w in row.items() if name.startswith(source)) for row in sourceRows]
        candidates=[i for i,p in enumerate(original) if masses[i]>.45 and .50<p.z<.94]
        measurements=[]
        for sample in range(39):
            z=.52+sample*.01;ids=[i for i in candidates if abs(original[i].z-z)<.025]
            if not ids:continue
            cy=sum(original[i].y*masses[i] for i in ids)/sum(masses[i] for i in ids)
            cx=sum(original[i].x*masses[i] for i in ids)/sum(masses[i] for i in ids)
            dx=sorted(abs(original[i].x-cx) for i in ids);dy=sorted(abs(original[i].y-cy) for i in ids)
            measurements.append((z,cx,cy,max(.015,dx[int((len(dx)-1)*.92)]),max(.018,dy[int((len(dy)-1)*.92)])))
        if len(measurements)<10:raise RuntimeError('Insufficient forelimb source surface: '+stem)
        carpus=origins[stem+'KneePivot'];elbow=origins[stem+'ElbowPivot'];shoulder=origins[stem+'Pivot']
        count=0
        for i,p in enumerate(original):
            if not .52<p.z<.91 or masses[i]<.12:continue
            strength=Smooth(.12,.48,masses[i])*(1-Smooth(.78,.91,p.z))
            a,b=(carpus,elbow) if p.z<elbow.z else (elbow,shoulder)
            axis=a.lerp(b,(p.z-a.z)/(b.z-a.z))
            cx,cy=Interpolate(measurements,p.z,1),Interpolate(measurements,p.z,2)
            rx,ry=Interpolate(measurements,p.z,3),Interpolate(measurements,p.z,4)
            targetRx,targetRy=Interpolate(profile,p.z,1),Interpolate(profile,p.z,2)
            target=Vector((axis.x+(p.x-cx)*targetRx/rx,axis.y+(p.y-cy)*targetRy/ry,p.z))
            points[i]=p.lerp(target,strength);count+=1
        records.append({'leg':stem,'fittedVertices':count,'elbowY':elbow.y,'carpusY':carpus.y})
    adjacency=[set() for p in points]
    for face in faces:
        for a,b in zip(face,face[1:]+face[:1]):adjacency[a].add(b);adjacency[b].add(a)
    selected=[i for i,p in enumerate(points) if .55<p.z<.86 and sum(w for name,w in sourceRows[i].items() if name.startswith(('HorseFrontLeft','HorseFrontRight')))>.22]
    for iteration in range(4):
        old=[p.copy() for p in points]
        for i in selected:
            if not adjacency[i]:continue
            delta=(sum((old[j] for j in adjacency[i]),Vector())/len(adjacency[i])-old[i])*.30
            if delta.length>.002:delta*=.002/delta.length
            points[i]=old[i]+delta
    print(json.dumps({'upperForelimbSurfaceFit':records}))
    return records

def CleanAxialWeights(skin):
    cleaned=0
    for vertex in skin.data.vertices:
        strength=Smooth(.84,1.04,vertex.co.y)*Smooth(.80,.96,vertex.co.z)
        if not strength:continue
        row={skin.vertex_groups[g.group].name:g.weight for g in vertex.groups}
        if sum(weight for name,weight in row.items() if name.startswith(('DonkeyFront','DonkeyRear')))<1e-8:continue
        axial={name:weight for name,weight in row.items() if not name.startswith(('DonkeyFront','DonkeyRear'))}
        total=sum(axial.values())
        if not total:continue
        row={name:weight*(1-strength)+axial.get(name,0)/total*strength for name,weight in row.items()}
        for group in list(vertex.groups):skin.vertex_groups[group.group].remove([vertex.index])
        for name,weight in row.items():
            if weight>1e-8:skin.vertex_groups[name].add([vertex.index],weight,'REPLACE')
        cleaned+=1
    print(json.dumps({'axialVerticesCleanedOfLimbInfluence':cleaned}))
