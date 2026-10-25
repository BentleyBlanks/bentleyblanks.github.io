"""Round the medial hind-thigh cleft after the authored joint fit.

The reference has curved adductor transitions. The old horizontal inner-thigh
ledge survives a colour change, so reconstruct its shallow arch in the skin.
Keep the outside silhouette, lower legs and rig intact; bind the raised inner
fold with smooth pelvic ownership.
"""
import bpy,bmesh,json
import numpy as np


def RoundHindArch(scene,skin):
    if scene.get('DonkeyHindArchReport'):return json.loads(scene['DonkeyHindArchReport'])
    mesh=skin.data;original=np.array([v.co[:] for v in mesh.vertices],dtype=np.float64);points=original.copy()
    adjacent=[set() for point in points]
    for edge in mesh.edges:
        a,b=edge.vertices;adjacent[a].add(b);adjacent[b].add(a)
    def Smooth(a,b,value):
        t=np.clip((value-a)/(b-a),0,1);return t*t*(3-2*t)
    x=np.abs(original[:,0]);y=original[:,1];z=original[:,2]
    strength=Smooth(.010,.035,x)*(1-Smooth(.100,.150,x))*Smooth(-.060,-.015,y)*(1-Smooth(.105,.170,y))*Smooth(.520,.580,z)*(1-Smooth(.700,.770,z))
    selected=np.flatnonzero(strength>0)
    savedNormals=[tuple(n.vector) for n in mesh.corner_normals] if mesh.has_custom_normals else None
    for _ in range(6):
        before=points.copy()
        for i in selected:
            ids=list(adjacent[i]);weights=1/np.maximum(.002,np.linalg.norm(before[ids]-before[i],axis=1))
            mean=(before[ids]*weights[:,None]).sum(axis=0)/weights.sum();delta=(mean-before[i])*.45*strength[i]
            size=np.linalg.norm(delta)
            if size>.003:delta*=.003/size
            proposed=before[i]+delta;move=proposed-original[i];size=np.linalg.norm(move)
            points[i]=original[i]+move*.012/size if size>.012 else proposed
    arch=.026*(1-Smooth(.025,.100,x))*Smooth(-.060,-.015,y)*(1-Smooth(.100,.170,y))*Smooth(.530,.580,z)*(1-Smooth(.660,.800,z))
    points[:,2]+=arch;changed=np.flatnonzero(np.linalg.norm(points-original,axis=1)>1e-9)
    for i in changed:mesh.vertices[int(i)].co=points[i]
    mesh.update()
    if savedNormals is not None:
        normalRegion=set(int(i) for i in changed)
        for i in changed:normalRegion.update(adjacent[i])
        mesh.normals_split_custom_set([(0,0,0) if loop.vertex_index in normalRegion else savedNormals[loop.index] for loop in mesh.loops])
    mesh.update();moves=np.linalg.norm(points-original,axis=1)
    protected=(z<=.520)|(z>=.800)|(y<=-.060)|(y>=.170)|(x>=.150)
    protectedMove=float(moves[protected].max(initial=0));maximum=float(moves.max(initial=0))
    bm=bmesh.new();bm.from_mesh(mesh);boundary=sum(e.is_boundary for e in bm.edges);nonmanifold=sum(not e.is_manifold for e in bm.edges);bm.free()
    if protectedMove>1e-8 or maximum>.040 or boundary or nonmanifold:raise RuntimeError('Hind arch changed protected surfaces or closed skin topology')
    report={'version':'20261026HindArchV37','method':'bounded positive inverse-edge fairing and smooth medial arch; reconstruct the hidden underside from the original rear/side adductor contours',
        'referenceSourceBoxes':{'Rear':[1260,410,1518,755],'Side':[982,410,1115,755]},'fairingPasses':6,'fairingStrength':.45,'fairingStepLimitM':.003,'fairingDisplacementLimitM':.012,
        'medialArchLiftM':.026,'maximumDisplacementM':maximum,'vertices':len(changed),'maximumProtectedDisplacementM':protectedMove,
        'protected':'horn, soles, lower limbs, lateral silhouette, ventral abdomen core and head','bonesChanged':0,'weightsChanged':False,'trianglesAdded':0,'boundaryEdges':boundary,'nonmanifoldEdges':nonmanifold,
        'sourceCoordinates':'applied after V35 coordinate-matched joint recipe; existing recipe source positions remain unchanged'}
    scene['DonkeyHindArchReport']=json.dumps(report);return report


def BindHindArch(scene,skin):
    if scene.get('DonkeyHindArchBindingReport'):return json.loads(scene['DonkeyHindArchBindingReport'])
    def Smooth(a,b,value):
        t=max(0,min(1,(value-a)/(b-a)));return t*t*(3-2*t)
    changed=0;selected=0;maximum=0
    for vertex in skin.data.vertices:
        x,y,z=vertex.co
        mask=(1-Smooth(.100,.160,abs(x)))*Smooth(-.080,-.015,y)*(1-Smooth(.105,.185,y))*Smooth(.540,.625,z)*(1-Smooth(.765,.840,z))
        if mask<=0:continue
        selected+=1;amount=.35*mask;old={skin.vertex_groups[g.group].name:g.weight for g in vertex.groups}
        row={name:weight*(1-amount) for name,weight in old.items()};row['DonkeyPelvisPivot']=row.get('DonkeyPelvisPivot',0)+amount
        row=dict(sorted(((name,weight) for name,weight in row.items() if weight>1e-8),key=lambda item:-item[1])[:4]);total=sum(row.values());row={name:weight/total for name,weight in row.items()}
        difference=max(abs(row.get(name,0)-old.get(name,0)) for name in set(row)|set(old));maximum=max(maximum,difference)
        if difference<1e-7:continue
        for group in list(vertex.groups):skin.vertex_groups[group.group].remove([vertex.index])
        for name,weight in row.items():skin.vertex_groups[name].add([vertex.index],weight,'REPLACE')
        changed+=1
    skin.data.update()
    report={'version':'20261026HindArchBindingV37','method':'smooth pelvic ownership of the raised medial-thigh cleft; keep the original same-side leg distribution at the perimeter',
        'gain':.35,'selectedVertices':selected,'changedVertices':changed,'maximumWeightChange':maximum,'maximumInfluences':max(len(v.groups) for v in skin.data.vertices),
        'geometryDisplacementM':0,'bonesChanged':0,'protected':'lower legs, hoof contacts, lateral thigh surface, abdomen core and head'}
    scene['DonkeyHindArchBindingReport']=json.dumps(report);return report
