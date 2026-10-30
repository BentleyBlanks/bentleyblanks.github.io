"""Derive the isolated current game trial with bounded surface certificates.

No canonical asset is written. Exact high-export triangulation is the reference.
Certification uses double-precision convex-triangle bounds;
sampling alone never establishes the three-millimetre continuous-surface gate.
"""
import bpy,hashlib,importlib.util,json,math,os,time,numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
repo=Path(os.environ.get('TYPE94_REPO_ROOT',str(Path(__file__).resolve().parents[2])))
base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=base/'GameTrialV58';acc=root/'Acceptance'
for p in [root,acc,root/'Exports']:p.mkdir(exist_ok=True)
assert not bpy.data.filepath
manifest=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_SurfaceStudyV56.json').read_text());source=Path(manifest['sourceBlend'])
assert hashlib.sha256(source.read_bytes()).hexdigest()==manifest['sourceBlendSha256']
bpy.ops.wm.open_mainfile(filepath=str(source));scene=bpy.context.scene;assert scene.get('BlenderMcpTask')=='Type94Tankette'
scene.render.threads_mode='FIXED';scene.render.threads=4
file=repo/'Taierzhuang1938/_blender/Script_Type94Export.py';spec=importlib.util.spec_from_file_location('GameTrialExport',file);exporter=importlib.util.module_from_spec(spec);spec.loader.exec_module(exporter)
LIMIT=.003;NUMERIC_MARGIN=.000002;CERT_LIMIT=LIMIT-NUMERIC_MARGIN;started=time.time();records=[]
asset=bpy.data.objects['Type94Tankette'];actual={asset}|set(asset.children_recursive);groups={}
for obj in actual:
    if obj.type=='MESH':groups.setdefault(obj.data.as_pointer(),[]).append(obj)
def Count(mesh):return sum(len(p.vertices)-2 for p in mesh.polygons)
def Surface(mesh):
    mesh.calc_loop_triangles();points=[v.co.copy()for v in mesh.vertices];triangles=[tuple(t.vertices)for t in mesh.loop_triangles]
    return BVHTree.FromPolygons(points,triangles,all_triangles=True),points,triangles
def SampleError(a,b):
    tree,_,_=Surface(b);a.calc_loop_triangles();maximum=0.;samples=0
    for vertex in a.vertices:
        hit=tree.find_nearest(vertex.co);maximum=max(maximum,hit[3]);samples+=1
    for face in a.loop_triangles:
        p=[a.vertices[i].co for i in face.vertices]
        for point in [(p[0]+p[1]+p[2])/3,(p[0]+p[1])/2,(p[1]+p[2])/2,(p[2]+p[0])/2]:
            hit=tree.find_nearest(point);maximum=max(maximum,hit[3]);samples+=1
    return dict(maximumM=maximum,samples=samples)
def Certify(a,b,maxCells=180000,maxDepth=14):
    target,points,faces=Surface(b);a.calc_loop_triangles();cache={};upper=0.;observed=0.;cells=0;unresolved=0
    def Near(p):
        key=tuple(p)
        if key not in cache:cache[key]=target.find_nearest(Vector(key))
        return cache[key]
    def FixedDistance(point,tri):
        x,y,z=[np.array(v,dtype=np.float64)for v in tri];edgeBound=math.inf
        for start,end in [(x,y),(y,z),(z,x)]:
            edge=end-start;den=float(edge@edge)
            t=max(0.,min(1.,float((point-start)@edge)/den))if den else 0.
            edgeBound=min(edgeBound,float(np.linalg.norm(point-(start+t*edge))))
        normal=np.cross(y-x,z-x);den=float(normal@normal)
        if den>1e-28:
            projection=point-normal*float((point-x)@normal)/den
            if all(float(np.cross(end-start,projection-start)@normal)>=0 for start,end in [(x,y),(y,z),(z,x)]):
                return min(edgeBound,abs(float((point-x)@normal))/math.sqrt(den))
        return edgeBound
    pending=[([np.array(a.vertices[i].co,dtype=np.float64)for i in face.vertices],0)for face in a.loop_triangles]
    while pending:
        p,depth=pending.pop();cells+=1
        centre=(p[0]+p[1]+p[2])/3;hit=Near(centre);vertexHits=[Near(v)for v in p];observed=max(observed,hit[3],*(h[3]for h in vertexHits))
        if observed>CERT_LIMIT:return dict(certified=False,maximumObservedM=observed,certifiedUpperM=None,cells=cells,unresolved=1,reason='Observed sample exceeds conservative certificate threshold')
        bound=math.inf
        candidateIds={hit[2]}|{h[2]for h in vertexHits}
        for faceId in candidateIds:
            tri=[points[i]for i in faces[faceId]]
            # Distance to one convex target triangle is convex over the
            # source triangle: the maximum vertex distance bounds its whole.
            fixed=max(FixedDistance(v,tri)for v in p);bound=min(bound,fixed)
        if bound<=CERT_LIMIT:upper=max(upper,bound);continue
        if depth>=maxDepth or cells>=maxCells:
            unresolved=len(pending)+1;break
        lengths=[float((p[(i+1)%3]-p[i])@(p[(i+1)%3]-p[i]))for i in range(3)];i=max(range(3),key=lambda i:lengths[i]);j=(i+1)%3;k=(i+2)%3;mid=(p[i]+p[j])/2
        pending.append(([p[i],mid,p[k]],depth+1));pending.append(([mid,p[j],p[k]],depth+1))
    return dict(certified=unresolved==0,maximumObservedM=observed,certifiedUpperM=upper if not unresolved else None,cells=cells,unresolved=unresolved,reason='Double-precision convex-target-triangle covering bounds'if not unresolved else'Certification refinement cap reached')
def Reduce(part,role,label):
    n=Count(part)
    if n<=24:return part,dict(sourceTriangles=n,candidateTriangles=n,ratio=1.,exactRetained=True,forward=dict(certified=True,certifiedUpperM=0.),reverse=dict(certified=True,certifiedUpperM=0.))
    ratios=[.055,.075,.09,.11,.15,.22,.35,.55,.75]if role=='Track'else[.13,.20,.28,.38,.55,.75]
    temp=bpy.data.objects.new('TemporaryGameReduction',part);scene.collection.objects.link(temp);trials=[];chosen=part;result=None
    for ratio in ratios:
        candidate=part.copy();temp.data=candidate;bpy.ops.object.select_all(action='DESELECT');temp.select_set(True);bpy.context.view_layer.objects.active=temp
        mod=temp.modifiers.new('LocalBoundedReduction','DECIMATE');mod.ratio=ratio;mod.use_collapse_triangulate=True
        if role=='Track':mod.use_symmetry=True;mod.symmetry_axis='X'
        bpy.ops.object.modifier_apply(modifier=mod.name);candidate=temp.data
        forward=SampleError(part,candidate);reverse=SampleError(candidate,part);row=dict(ratio=ratio,triangles=Count(candidate),sampleForward=forward,sampleReverse=reverse)
        if max(forward['maximumM'],reverse['maximumM'])<=.00285:
            f=Certify(part,candidate);r=Certify(candidate,part);row.update(forward=f,reverse=r)
            if f['certified']and r['certified']:chosen=candidate;result=dict(sourceTriangles=n,candidateTriangles=Count(candidate),ratio=ratio,exactRetained=False,forward=f,reverse=r);trials.append(row);break
        trials.append(row);temp.data=part
        if candidate.users==0:bpy.data.meshes.remove(candidate)
    bpy.data.objects.remove(temp,do_unlink=True)
    if result is None:result=dict(sourceTriangles=n,candidateTriangles=n,ratio=1.,exactRetained=True,forward=dict(certified=True,certifiedUpperM=0.),reverse=dict(certified=True,certifiedUpperM=0.))
    result['trials']=trials
    return chosen,result
def LooseParts(mesh):
    adjacency=[set()for _ in mesh.vertices];faceByVertex=[[]for _ in mesh.vertices]
    for e in mesh.edges:a,b=e.vertices;adjacency[a].add(b);adjacency[b].add(a)
    for p in mesh.polygons:
        for i in p.vertices:faceByVertex[i].append(p.index)
    unseen=set(range(len(mesh.vertices)));parts=[]
    while unseen:
        stack=[unseen.pop()];vertices=[]
        while stack:
            i=stack.pop();vertices.append(i)
            for j in adjacency[i]:
                if j in unseen:unseen.remove(j);stack.append(j)
        ids=sorted({f for i in vertices for f in faceByVertex[i]})
        if ids:parts.append(ids)
    return parts
def SplitPart(mesh,ids):
    vertices=sorted({i for f in ids for i in mesh.polygons[f].vertices});lookup={i:j for j,i in enumerate(vertices)};part=bpy.data.meshes.new('Mesh_GameTrialLocalPart')
    part.from_pydata([mesh.vertices[i].co for i in vertices],[],[[lookup[i]for i in mesh.polygons[f].vertices]for f in ids]);part.update()
    for m in mesh.materials:part.materials.append(m)
    uv=part.uv_layers.new(name='UVMap')
    for p,f in zip(part.polygons,ids):
        old=mesh.polygons[f];p.use_smooth=old.use_smooth;p.material_index=old.material_index
        for a,b in zip(p.loop_indices,old.loop_indices):uv.data[a].uv=mesh.uv_layers.active.data[b].uv
    return part
def Combine(parts,materials):
    points=[];faces=[];smooth=[];uvs=[];slots=[]
    for part in parts:
        offset=len(points);points.extend(v.co.copy()for v in part.vertices)
        for p in part.polygons:faces.append([i+offset for i in p.vertices]);smooth.append(p.use_smooth);slots.append(p.material_index);uvs.extend(part.uv_layers.active.data[i].uv.copy()for i in p.loop_indices)
    mesh=bpy.data.meshes.new('Mesh_Type94GameTrial');mesh.from_pydata(points,[],faces);mesh.update()
    for m in materials:mesh.materials.append(m)
    layer=mesh.uv_layers.new(name='UVMap')
    for item,uv in zip(layer.data,uvs):item.uv=uv
    for p,s,m in zip(mesh.polygons,smooth,slots):p.use_smooth=s;p.material_index=m
    return mesh
for number,users in enumerate(sorted(groups.values(),key=lambda users:users[0].name)):
    users=sorted(users,key=lambda o:o.name);obj=users[0];original=exporter.TriangulatedCopy(obj.data);role=obj.get('SurfaceRole','Paint');components=LooseParts(original)
    # Track geometry is one shared template, measured once and applied to all
    #160links. Composite stationary meshes are reduced island-by-island.
    reduced=[];parts=[]
    if role=='Track':
        candidate,record=Reduce(original,role,obj.name);parts=[record]
    else:
        for index,ids in enumerate(components):
            part=SplitPart(original,ids);low,row=Reduce(part,role,obj.name);reduced.append(low);parts.append(row)
        candidate=Combine(reduced,list(original.materials))
    for user in users:user.data=candidate
    record=dict(mesh=obj.name,role=role,instances=len(users),sourceTriangles=Count(original),candidateTriangles=Count(candidate),looseParts=len(components),parts=parts)
    records.append(record)
    partial=dict(schema='Type94GameTrialProgressV1',sourceSha256=manifest['sha256'],completedGroups=number+1,totalGroups=len(groups),records=records,elapsedSeconds=time.time()-started,complete=False)
    (acc/'Data_GameTrialProgressV58.json').write_text(json.dumps(partial,indent=2)+'\n')
    print('TYPE94_V58_GROUP',number+1,len(groups),obj.name,Count(original),Count(candidate),len(users),flush=True)
total=sum(r['candidateTriangles']*r['instances']for r in records);within=total<80000;allCertified=all(p['forward']['certified']and p['reverse']['certified']for r in records for p in r['parts'])
report=dict(schema='Type94BoundedGameTrialV1',sourceGlbSha256=manifest['sha256'],sourceBlendSha256=manifest['sourceBlendSha256'],triangles=total,triangleLimitExclusive=80000,withinBudget=within,
    maximumAllowedDistanceM=LIMIT,numericSafetyMarginM=NUMERIC_MARGIN,allLocalSurfacesCertified=allCertified,records=records,elapsedSeconds=time.time()-started,
    reference='Exact high-export triangulation, all local parts in both directions; unchanged rigid poses retain the certificate under instancing',
    textureScope='High preview PBR maps and inherited UVs retained for this technical trial; low tangent-normal projection and appearance remain unaccepted',
    wholeReferenceAccepted=False,gameDerivativeAccepted=False,complete=False)
(acc/'Data_GameTrialReductionV58.json').write_text(json.dumps(report,indent=2)+'\n')
scene['GameTrialReferenceSha256']=manifest['sha256'];scene['GameTrialBudgetPassed']=within;scene['GameTrialSurfaceCertificatePassed']=allCertified;scene['WholeReferenceAccepted']=False
blend=root/'Scene_Type94TanketteGameTrialV58.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend));bpy.ops.object.select_all(action='DESELECT')
for obj in actual:obj.select_set(True)
glb=root/'Exports/Model_Type94TanketteGameTrialV58.glb';exporter.ExportGltf(glb)
report.update(sourceBlend=str(blend),sourceGlb=str(glb),sourceBlendSha256=hashlib.sha256(blend.read_bytes()).hexdigest(),sha256=hashlib.sha256(glb.read_bytes()).hexdigest())
(acc/'Data_GameTrialReductionV58.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(triangles=total,withinBudget=within,allLocalSurfacesCertified=allCertified,sha256=report['sha256'],gameDerivativeAccepted=False),indent=2),flush=True)
