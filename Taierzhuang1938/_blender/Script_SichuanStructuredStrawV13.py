"""Keep complete native straw tubes while sampling their authored section rings.

The runtime importer sorts vertices. Recover the authored rings through welded
geometric topology and the real cap UV charts; never rely on vertex index order.
Only the three selected straw meshes are replaced, with source ring positions.
"""
import bpy, math, heapq, json, array, runpy
from pathlib import Path
from collections import defaultdict, Counter
from mathutils import Vector

TARGETS=('Pack_InterlacedMatGrass','Pack_GrassSandal01BraidedWeave','Pack_GrassSandal02BraidedWeave')

def Name(obj):
    return obj.get('QualityOriginalName',obj.get('SourceOriginalName',obj.name.split('.')[0])).removeprefix('HighProjection_')

def Triangles(obj):
    return sum(len(p.vertices)-2 for p in obj.data.polygons)

def Cycle(edges):
    graph=defaultdict(list)
    for a,b in edges:graph[a].append(b);graph[b].append(a)
    if not graph or any(len(n)!=2 for n in graph.values()):return None
    start=min(graph);out=[start];previous=None;current=start
    while True:
        options=graph[current];nxt=options[0] if options[0]!=previous else options[1]
        if nxt==start:return out if len(out)==len(graph) else None
        if nxt in out:return None
        out.append(nxt);previous,current=current,nxt

def RecoverTubes(obj):
    mesh=obj.data;coords=[];lookup={};vertexMap=[]
    for v in mesh.vertices:
        key=tuple(v.co)
        if key not in lookup:lookup[key]=len(coords);coords.append(Vector(key))
        vertexMap.append(lookup[key])
    parent=list(range(len(coords)))
    def find(v):
        while parent[v]!=v:parent[v]=parent[parent[v]];v=parent[v]
        return v
    faces=[];faceUvs=[];adj=defaultdict(set);edgeFaces=defaultdict(list)
    uv=mesh.uv_layers.active
    assert uv is not None,(obj.name,'requires native UV charts')
    for p in mesh.polygons:
        ids=tuple(vertexMap[i] for i in p.vertices)
        if len(set(ids))!=len(ids):raise RuntimeError((obj.name,'collapsed high face',p.index))
        faces.append(ids);faceUvs.append(tuple(tuple(round(c,7) for c in uv.data[i].uv) for i in p.loop_indices))
        root=find(ids[0])
        for v in ids[1:]:
            other=find(v)
            if root!=other:parent[other]=root
        for a,b in zip(ids,ids[1:]+ids[:1]):
            adj[a].add(b);adj[b].add(a);edgeFaces[tuple(sorted((a,b)))].append(p.index)
    comps={}
    for i,face in enumerate(faces):
        group=comps.setdefault(find(face[0]),{'vertices':set(),'faces':[]})
        group['vertices'].update(face);group['faces'].append(i)
    chartParent=list(range(len(faces)))
    def chartFind(i):
        while chartParent[i]!=i:chartParent[i]=chartParent[chartParent[i]];i=chartParent[i]
        return i
    for edge,indices in edgeFaces.items():
        if len(indices)!=2:continue
        a,b=indices;fa,fb=faces[a],faces[b]
        ua=tuple(faceUvs[a][fa.index(v)] for v in edge);ub=tuple(faceUvs[b][fb.index(v)] for v in edge)
        if ua==ub:
            ra,rb=chartFind(a),chartFind(b)
            if ra!=rb:chartParent[rb]=ra
    charts=defaultdict(list)
    for i in range(len(faces)):charts[chartFind(i)].append(i)
    # Smart UV on the sandals can weld a small cap chart to a side panel.
    # Recover real planar face groups as a second, geometry-based cap source.
    planeParent=list(range(len(faces)));normals=[]
    for face in faces:
        normal=(coords[face[1]]-coords[face[0]]).cross(coords[face[2]]-coords[face[0]])
        if normal.length>1e-20:normal.normalize()
        normals.append(normal)
    def planeFind(i):
        while planeParent[i]!=i:planeParent[i]=planeParent[planeParent[i]];i=planeParent[i]
        return i
    for edge,indices in edgeFaces.items():
        if len(indices)!=2:continue
        a,b=indices
        if normals[a].dot(normals[b])>.999999 and max(abs((coords[v]-coords[faces[a][0]]).dot(normals[a])) for v in faces[b])<2e-7:
            ra,rb=planeFind(a),planeFind(b)
            if ra!=rb:planeParent[rb]=ra
    planes=defaultdict(list)
    for i in range(len(faces)):planes[planeFind(i)].append(i)
    candidates=defaultdict(list)
    for indices in [*charts.values(),*planes.values()]:
        if not 2<=len(indices)<=6:continue
        points=set(v for i in indices for v in faces[i]);n=len(points)
        if n not in (4,6,8) or len(indices)!=n-2:continue
        counts=Counter(tuple(sorted((a,b))) for i in indices for a,b in zip(faces[i],faces[i][1:]+faces[i][:1]))
        ring=Cycle([e for e,count in counts.items() if count==1])
        if ring is None or len(ring)!=n:continue
        normal=(coords[ring[1]]-coords[ring[0]]).cross(coords[ring[2]]-coords[ring[0]])
        if normal.length<1e-14:continue
        normal.normalize()
        if max(abs((coords[v]-coords[ring[0]]).dot(normal)) for v in ring)>2e-6:continue
        candidates[find(ring[0])].append((ring,indices))
    tubes=[];errors=[]
    for key,comp in comps.items():
        recovered=None
        for first,capFaces in candidates[key]:
            n=len(first);rings=[first];visited=set(first);valid=True
            for iteration in range(len(comp['vertices'])//n):
                current=rings[-1];nxt=set(v for q in current for v in adj[q])-visited
                if not nxt:break
                if len(nxt)!=n:valid=False;break
                edges=set()
                for a in nxt:
                    for b in adj[a]&nxt:
                        if a<b and any(any(v not in nxt for v in faces[fi]) for fi in edgeFaces[(a,b)]):edges.add((a,b))
                cycle=Cycle(edges)
                if cycle is None:valid=False;break
                choices=[]
                for seq in (cycle,list(reversed(cycle))):
                    for offset in range(n):
                        order=seq[offset:]+seq[:offset]
                        cost=sum((coords[a]-coords[b]).length_squared for a,b in zip(current,order))
                        choices.append((cost,order))
                order=min(choices,key=lambda item:item[0])[1];rings.append(order);visited.update(order)
            if not valid or visited!=comp['vertices'] or len(rings)<2:continue
            ringIds={v:ri for ri,ring in enumerate(rings) for v in ring}
            if any(max(ringIds[v] for v in faces[fi])-min(ringIds[v] for v in faces[fi])>1 for fi in comp['faces']):continue
            # First section must have the outward native cap winding.
            native=faces[capFaces[0]];nativeNormal=(coords[native[1]]-coords[native[0]]).cross(coords[native[2]]-coords[native[0]])
            orderNormal=sum((coords[a].cross(coords[b]) for a,b in zip(first,first[1:]+first[:1])),Vector())
            if nativeNormal.dot(orderNormal)<0:rings=[list(reversed(ring)) for ring in rings]
            positions=[[coords[v] for v in ring] for ring in rings]
            centres=[sum(ring,Vector())/n for ring in positions]
            length=sum((b-a).length for a,b in zip(centres,centres[1:]))
            diameter=max((v-centres[ri]).length*2 for ri,ring in enumerate(positions) for v in ring)
            recovered={'rings':positions,'centres':centres,'length':length,'diameter':diameter,'sourceSides':n,'sourceFaces':len(comp['faces']),'sourceVertices':len(visited)}
            break
        if recovered is None:errors.append({'vertices':len(comp['vertices']),'faces':len(comp['faces']),'capCandidates':len(candidates[key])})
        else:tubes.append(recovered)
    if errors:raise RuntimeError(json.dumps({'mesh':obj.name,'components':len(comps),'recovered':len(tubes),'failures':errors[:30]}))
    return tubes,{'sourceObject':obj.name,'sourceTriangles':Triangles(obj),'sourceComponents':len(comps),'recoveredComponents':len(tubes),'sourceRings':sum(len(t['rings']) for t in tubes),'weldedVertices':len(coords),'sectionHistogram':dict(Counter(t['sourceSides'] for t in tubes)),'ringHistogram':dict(Counter(len(t['rings']) for t in tubes))}

def SegmentError(tube,a,b):
    if b<=a+1:return (0,None)
    rings=tube['rings'];centres=tube['centres'];best=(0,None)
    # Position along physical centreline avoids allocating rings only for authored uneven sampling.
    distance=[0.0]
    for i in range(a,b):distance.append(distance[-1]+(centres[i+1]-centres[i]).length)
    length=distance[-1]
    for i in range(a+1,b):
        f=distance[i-a]/length if length>1e-12 else (i-a)/(b-a)
        error=max((v-(va*(1-f)+vb*f)).length for v,va,vb in zip(rings[i],rings[a],rings[b]))
        if error>best[0]:best=(error,i)
    return best

def Sample(tubes,budget,isMat):
    kept=[];dropped=[]
    for t in tubes:
        if t['diameter']<.00075 and t['length']<.018:dropped.append(t);continue
        t['sides']=min(4,t['sourceSides'])
        t['chosen']={0,len(t['rings'])-1};t['segments']={(0,len(t['rings'])-1)};kept.append(t)
    current=sum(4*t['sides']-4 for t in kept)
    if current>budget:raise RuntimeError(('tube minimum exceeds budget',current,budget,len(kept)))
    heap=[];serial=0
    def Push(ti,a,b):
        nonlocal serial
        error,index=SegmentError(kept[ti],a,b)
        if index is not None:
            heapq.heappush(heap,(-error,serial,ti,a,b,index));serial+=1
    for ti,t in enumerate(kept):Push(ti,0,len(t['rings'])-1)
    while heap:
        error,_,ti,a,b,index=heapq.heappop(heap);t=kept[ti]
        if (a,b) not in t['segments']:continue
        cost=2*t['sides']
        if current+cost>budget:continue
        t['segments'].remove((a,b));t['segments'].update(((a,index),(index,b)));t['chosen'].add(index);current+=cost
        Push(ti,a,index);Push(ti,index,b)
    maximum=max((SegmentError(t,a,b)[0] for t in kept for a,b in t['segments']),default=0)
    return kept,{'keptComponents':len(kept),'droppedTinyComponents':len(dropped),'droppedNativeTriangles':sum(t['sourceFaces'] for t in dropped),'triangles':current,'sampledRings':sum(len(t['chosen']) for t in kept),'maxProfileChordErrorM':maximum}

def BuildGeometry(highObj,lowObj,tubes):
    verts=[];faces=[];worldToLocal=lowObj.matrix_world.inverted()@highObj.matrix_world
    for t in tubes:
        n=t['sides'];sourceN=t['sourceSides']
        profile=[0,1,3,4] if sourceN==6 and n==4 else [round(i*sourceN/n)%sourceN for i in range(n)]
        rings=sorted(t['chosen']);offset=len(verts)
        for index in rings:verts.extend(tuple(worldToLocal@t['rings'][index][j]) for j in profile)
        faces.append(tuple(offset+j for j in range(n)))
        for ri in range(len(rings)-1):
            for j in range(n):
                a=offset+ri*n+j;b=offset+(ri+1)*n+j;c=offset+(ri+1)*n+(j+1)%n;d=offset+ri*n+(j+1)%n
                faces.append((a,b,c,d))
        faces.append(tuple(offset+(len(rings)-1)*n+j for j in reversed(range(n))))
    mesh=bpy.data.meshes.new(lowObj.data.name+'_StructuredV13');mesh.from_pydata(verts,[],faces);mesh.update()
    changed=mesh.validate(verbose=False,clean_customdata=False)
    assert not changed,('new structured tubes needed topology repair',lowObj.name)
    for material in lowObj.data.materials:mesh.materials.append(material)
    for p in mesh.polygons:p.use_smooth=True
    mesh.uv_layers.new(name='ProjectionUV')
    return mesh

def InspectStructuredStrawSources(highRoot):
    return {name:RecoverTubes(next(o for o in highRoot.children_recursive if o.type=='MESH' and Name(o)==name))[1] for name in TARGETS}

def ReserveWholeRollCapsProjectionUv(repo,outputDir):
    """Reserve two substantial planar charts after the five-part Smart UV step.

    Native cap faces are located through the actual frozen high cap triangles.
    No geometric data, loop order or cloth UV is changed by this operation.
    """
    from mathutils import kdtree
    repo,outputDir=Path(repo),Path(outputDir)
    projection=runpy.run_path(str(repo/'Taierzhuang1938/_blender/Script_SichuanLodProjectionV13.py'))
    helper=runpy.run_path(str(repo/'Taierzhuang1938/_blender/Script_SichuanQualityNormalTransferV13.py'))
    scene=bpy.context.scene;high=bpy.data.objects[scene['ProjectionHighRoot']]
    source=next(o for o in high.children_recursive if Name(o)=='Pack_QualityMatEndCapsV12')
    target=bpy.data.objects['Pack_StrawMat'];mesh=target.data;uv=mesh.uv_layers.active
    before=helper['MeshEvidence'](mesh);geometryBefore=projection['GeometryOnly'](mesh)
    otherBefore={role:helper['MeshEvidence'](bpy.data.objects[role].data) for role in ('Pack_Bundle','Pack_Binding','Pack_Jacket','Pack_Sandals')}
    tree=kdtree.KDTree(len(source.data.polygons))
    for face in source.data.polygons:tree.insert(source.matrix_world@face.center,face.index)
    tree.balance();ends={-1:[],1:[]}
    for face in mesh.polygons:
        centre=target.matrix_world@face.center
        co,index,distance=tree.find(centre)
        if distance<2e-6 and len(face.vertices)==3:ends[-1 if centre.x<0 else 1].append(face)
    assert all(len(faces)==128 for faces in ends.values()),{key:len(faces) for key,faces in ends.items()}
    capIds={f.index for faces in ends.values() for f in faces}
    for face in mesh.polygons:
        if face.index not in capIds:
            for li in face.loop_indices:uv.data[li].uv.x*=.84
    records={}
    for sign,faces in ends.items():
        vertices={index:target.matrix_world@mesh.vertices[index].co for face in faces for index in face.vertices}
        minima=[min(v[i] for v in vertices.values()) for i in (1,2)];maxima=[max(v[i] for v in vertices.values()) for i in (1,2)]
        spans=[b-a for a,b in zip(minima,maxima)];scale=.12/max(spans);height=spans[1]*scale;width=spans[0]*scale
        centreV=.26 if sign<0 else .74
        for face in faces:
            for li in face.loop_indices:
                point=vertices[mesh.loops[li].vertex_index]
                uv.data[li].uv=(.92+(point.y-.5*(minima[0]+maxima[0]))*scale,centreV+(point.z-.5*(minima[1]+maxima[1]))*scale)
        points=[uv.data[li].uv.copy() for face in faces for li in face.loop_indices]
        area=sum(abs(sum(a.x*b.y-b.x*a.y for a,b in zip(values,values[1:]+values[:1])))*.5 for face in faces for values in [[uv.data[li].uv.copy() for li in face.loop_indices]])
        assert min(width,height)*4096>=256,(sign,width,height)
        records[str(sign)]={'triangles':len(faces),'uniqueOutlineVertices':len(vertices),'uvArea':area,'pixels4096':area*4096**2,'boundsPx4096':[width*4096,height*4096],'uvBounds':[[min(p[i] for p in points),max(p[i] for p in points)] for i in range(2)],'planarContinuous':True}
    mesh.update();after=helper['MeshEvidence'](mesh);geometryAfter=projection['GeometryOnly'](mesh)
    assert geometryBefore==geometryAfter
    assert all(helper['MeshEvidence'](bpy.data.objects[role].data)==value for role,value in otherBefore.items())
    report={'generator':'SichuanReservedWholeRollCapUvV13','matching':'256 actual frozen high cap triangle centres within 2um','nonCapURange':[0,.84],'capURange':[.86,.98],'highAndLowGeometryUnchanged':True,'geometryOnlySha256':geometryAfter,'otherFourPartMeshEvidenceUnchanged':True,'before':before,'after':after,'ends':records}
    stateFile=outputDir/'Data_ProjectionPreparationV13.json';previous=stateFile.read_bytes()
    (outputDir/'Data_ProjectionPreparationBeforeReservedCapsV13.json').write_bytes(previous)
    state=json.loads(previous);record=next(row for row in state['objects'] if row['part']=='Pack_StrawMat')
    record['afterInitialSmartUv']=record['afterReunwrap'];record['afterReunwrap']={**after,'geometryOnlySha256':geometryAfter};state['reservedWholeRollCapsUv']=report
    stateFile.write_text(json.dumps(state,indent=2)+'\n')
    (outputDir/'Data_WholeRollCapUvAuditV13.json').write_text(json.dumps(report,indent=2)+'\n')
    print('CAP_UV_RESERVED',json.dumps(records),flush=True)
    return report

def RebuildStructuredStraw(highRoot,lowRoot,matBudget=14500,sandalsBudget=8200,totalLimit=40000):
    highs={Name(o):o for o in highRoot.children_recursive if o.type=='MESH'};lows={Name(o):o for o in lowRoot.children_recursive if o.type=='MESH'}
    supports={}
    for role in ('Pack_StrawMat','Pack_Sandals'):
        part=next(o for o in lowRoot.children if o.name==role)
        supports[role]=sum(Triangles(o) for o in part.children_recursive if o.type=='MESH' and Name(o) not in TARGETS)
        if part.type=='MESH' and Name(part) not in TARGETS:supports[role]+=Triangles(part)
    budgets={TARGETS[0]:matBudget-supports['Pack_StrawMat'],TARGETS[1]:(sandalsBudget-supports['Pack_Sandals'])//2,TARGETS[2]:(sandalsBudget-supports['Pack_Sandals'])//2}
    staged=[];reports={}
    for name in TARGETS:
        tubes,recovered=RecoverTubes(highs[name]);sampled,sampling=Sample(tubes,budgets[name],name==TARGETS[0]);mesh=BuildGeometry(highs[name],lows[name],sampled)
        assert sum(len(p.vertices)-2 for p in mesh.polygons)==sampling['triangles']
        staged.append((lows[name],mesh));reports[name]={**recovered,**sampling,'budget':budgets[name]}
    before=sum(Triangles(o) for o in lowRoot.children_recursive if o.type=='MESH');old=sum(Triangles(o) for o,_ in staged);new=sum(sum(len(p.vertices)-2 for p in mesh.polygons) for _,mesh in staged)
    assert before-old+new<=totalLimit,(before,old,new,totalLimit)
    for obj,mesh in staged:obj.data=mesh;obj['StructuredNativeRingSampling']=True
    return {'generator':'SichuanStructuredStrawV13','source':'actual-frozen-high-runtime-native-ring-positions','requiresNewUvAndHighProjection':True,'wholeMatEndCapsPreserved':True,'sourceMutation':False,'supports':supports,'beforeTriangles':before,'afterTriangles':before-old+new,'meshes':reports}
