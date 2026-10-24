"""Anatomical upper-trunk width, with adaptive sections and lateral fairing."""
import math
def Smooth(a,b,value):
    t=max(0,min(1,(value-a)/(b-a)));return t*t*(3-2*t)
upperBodyRows=[(.87,1),(.89,1),(.927,1.10),(.962,1.33),(.998,1.47),(1.033,1.44),(1.068,1.30),(1.10,1),(1.14,1)]
def HeightScale(z):
    if z<=upperBodyRows[0][0] or z>=upperBodyRows[-1][0]:return 1
    slopes=[(b[1]-a[1])/(b[0]-a[0]) for a,b in zip(upperBodyRows,upperBodyRows[1:])];tangents=[slopes[0]]
    tangents.extend(0 if a*b<=0 else 2*a*b/(a+b) for a,b in zip(slopes,slopes[1:]));tangents.append(slopes[-1])
    i=next(i for i,(a,b) in enumerate(zip(upperBodyRows,upperBodyRows[1:])) if a[0]<=z<=b[0]);a,b=upperBodyRows[i:i+2];span=b[0]-a[0];t=(z-a[0])/span
    return (2*t**3-3*t*t+1)*a[1]+(t**3-2*t*t+t)*span*tangents[i]+(-2*t**3+3*t*t)*b[1]+(t**3-t*t)*span*tangents[i+1]
def UpperBodyScale(forward,height):
    rumpMass=Smooth(-.22,-.08,forward)*(1-Smooth(.16,.30,forward));shoulderMass=Smooth(.30,.48,forward)*(1-Smooth(.70,.84,forward))
    upper=1+(HeightScale(height)-1)*Smooth(-.22,-.08,forward)*(1-Smooth(.70,.84,forward))*(.15+.85*max(rumpMass,shoulderMass))
    rump=.11*math.exp(-((height-.885)/.070)**2)*Smooth(.74,.80,height)*(1-Smooth(.935,.965,height))*Smooth(-.22,-.10,forward)*(1-Smooth(.14,.24,forward))
    shoulder=.05*math.exp(-((height-.865)/.045)**2)*Smooth(.75,.80,height)*Smooth(.32,.42,forward)*(1-Smooth(.68,.78,forward))
    return upper*(1+rump+shoulder)

def FitUpperBody(scene,skin):
    import bmesh
    if scene.get('DonkeyUpperBodyRevision'):raise RuntimeError('Upper body fit requires the original reference skin')
    bm=bmesh.new();bm.from_mesh(skin.data);beforeTriangles=sum(len(f.verts)-2 for f in bm.faces)
    def Local(face):
        p=face.calc_center_median();return (-.24<p.y<.30 or .42<p.y<.88) and .82<p.z<1.16
    bmesh.ops.triangulate(bm,faces=[face for face in bm.faces if Local(face)])
    cuts=[]
    for height in [.90,.94,.98,1.02,1.06]:
        selected=[face for face in bm.faces if Local(face) and min(v.co.z for v in face.verts)<height-1e-6 and max(v.co.z for v in face.verts)>height+1e-6 and max(v.co.z for v in face.verts)-min(v.co.z for v in face.verts)>.045]
        if not selected:continue
        geometry=set(selected)
        for face in selected:geometry.update(face.edges);geometry.update(face.verts)
        bmesh.ops.bisect_plane(bm,geom=list(geometry),dist=1e-7,plane_co=(0,0,height),plane_no=(0,0,1),clear_inner=False,clear_outer=False);cuts.append(height)
    added=sum(len(f.verts)-2 for f in bm.faces)-beforeTriangles;bm.to_mesh(skin.data);bm.free();skin.data.update();trimmed=0
    for vertex in skin.data.vertices:
        if len(vertex.groups)<=4:continue
        rows=sorted(((g.group,g.weight) for g in vertex.groups),key=lambda row:-row[1])[:4];total=sum(weight for _,weight in rows)
        for group in list(vertex.groups):skin.vertex_groups[group.group].remove([vertex.index])
        for group,weight in rows:skin.vertex_groups[group].add([vertex.index],weight/total,'REPLACE')
        trimmed+=1
    before=[v.co.copy() for v in skin.data.vertices];maximum=0;changed=0;minimumScale=1;maximumScale=1
    for vertex in skin.data.vertices:
        x,y,z=vertex.co;scale=UpperBodyScale(y,z);vertex.co.x=x*scale;delta=abs(vertex.co.x-x)
        if delta>1e-8:changed+=1;maximum=max(maximum,delta);minimumScale=min(minimumScale,scale);maximumScale=max(maximumScale,scale)
    adjacency=[set() for _ in skin.data.vertices]
    for edge in skin.data.edges:
        a,b=edge.vertices;adjacency[a].add(b);adjacency[b].add(a)
    displacement=[v.co.x-p.x for v,p in zip(skin.data.vertices,before)]
    for iteration in range(8):
        old=displacement[:]
        for i,p in enumerate(before):
            if abs(old[i])<1e-8 or abs(p.x)<.004 or not adjacency[i]:continue
            weights=[(j,1/max(.005,(before[j]-p).length)) for j in adjacency[i]];average=sum(old[j]*w for j,w in weights)/sum(w for _,w in weights)
            displacement[i]=old[i]*.65+average*.35
    for vertex,p,delta in zip(skin.data.vertices,before,displacement):vertex.co.x=p.x+delta
    maximum=max(abs(v.co.x-p.x) for v,p in zip(skin.data.vertices,before))
    skin.data.update()
    if any(abs(v.co.y-p.y)>1e-8 or abs(v.co.z-p.z)>1e-8 for v,p in zip(skin.data.vertices,before)):raise RuntimeError('Lateral body fit changed the side profile')
    bm=bmesh.new();bm.from_mesh(skin.data);audit={'boundaryEdges':sum(e.is_boundary for e in bm.edges),'nonmanifoldEdges':sum(not e.is_manifold for e in bm.edges),'volumeM3':bm.calc_volume(signed=True)};bm.free()
    if audit['boundaryEdges'] or audit['nonmanifoldEdges']:raise RuntimeError('Upper body fit damaged the closed skin')
    scene['DonkeyUpperBodyRevision']='20261024UpperBodyV16'
    head=max(((v.co-p).length for v,p in zip(skin.data.vertices,before) if p.y>=.90),default=0);lower=max(((v.co-p).length for v,p in zip(skin.data.vertices,before) if p.z<.30),default=0)
    if head>1e-8 or lower>1e-8:raise RuntimeError('Upper-trunk fit changed a protected head or lower-limb point')
    return {'version':scene['DonkeyUpperBodyRevision'],'method':'reference-profile lateral upper-trunk volume with adaptive horizontal sections and displacement fairing; Y/Z preserved','heightScaleRows':upperBodyRows,'refinementTriangles':added,'sectionHeightsM':cuts,'forwardFalloffM':[-.22,-.08,.70,.84],'longitudinalMasses':'scapular and gluteal emphasis, narrow saddle retained','anatomicalFill':{'rumpGain':.11,'rumpCentreZ':.885,'rumpSigmaZ':.070,'shoulderGain':.05,'shoulderCentreZ':.865,'shoulderSigmaZ':.045},'lateralFairing':{'iterations':8,'rate':.35,'inverseDistanceWeights':True},'trimmedSkinVertices':trimmed,'changedVertices':changed,'maximumLateralDisplacementM':maximum,'scaleRangeBeforeFairing':[minimumScale,maximumScale],'sideProfileUnchanged':True,'maximumHeadDisplacementM':head,'maximumLowerLimbDisplacementM':lower,'integrity':audit}
