"""Current-source bounded cab-roof sampling; high source retained."""
import math
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt

def Param(index):
    index%=561
    return Vector((index%33,index//33))

def Cross(a,b):return a.x*b.y-a.y*b.x

def Bary(point,triangle):
    a,b,c=triangle;den=Cross(b-a,c-a);v=Cross(point-a,c-a)/den;w=Cross(b-a,point-a)/den
    return (1-v-w,v,w)

def Blend(values,weights):return sum((v*w for v,w in zip(values,weights)),values[0]*0)

def Clip(subject,clip):
    if Cross(clip[1]-clip[0],clip[2]-clip[0])<0:clip=clip[::-1]
    out=list(subject)
    for a,b in zip(clip,clip[1:]+clip[:1]):
        current=out;out=[]
        if not current:break
        for p,q in zip(current,current[1:]+current[:1]):
            x,y=Cross(b-a,p-a),Cross(b-a,q-a);inside=x>=-1e-8;nextInside=y>=-1e-8
            if inside:out.append(p)
            if inside!=nextInside:out.append(p+(q-p)*(x/(x-y)))
    return out

def Area(polygon):return abs(sum(Cross(a,b) for a,b in zip(polygon,polygon[1:]+polygon[:1])))/2 if len(polygon)>=3 else 0

def OverlayBound(source,new):
    bins={}
    for tri in new:
        for row in range(max(0,math.floor(min(p.y for p in tri['param']))),min(16,math.ceil(max(p.y for p in tri['param'])))):
            for col in range(max(0,math.floor(min(p.x for p in tri['param']))),min(32,math.ceil(max(p.x for p in tri['param'])))):bins.setdefault((row,col),[]).append(tri)
    maximumPosition=0;maximumUv=0;maximumNormalBound=0;maximumSampleNormal=0;overlays=0;coverageErrors=[];worstNormal=None;worstPosition=None
    for tri in source:
        parameter=[Param(i) for i in tri['indices']];key=(int(min(p.y for p in parameter)),int(min(p.x for p in parameter)));covered=0
        for low in bins.get(key,[]):
            polygon=Clip(parameter,low['param']);area=Area(polygon)
            if area<1e-10:continue
            overlays+=1;covered+=area;delta=0
            for point in polygon:
                a,b=Bary(point,parameter),Bary(point,low['param']);position=(Blend(tri['p'],a)-Blend(low['p'],b)).length;uv=(Blend(tri['uv'],a)-Blend(low['uv'],b)).length;oldNormal,newNormal=Blend(tri['n'],a),Blend(low['n'],b);delta=max(delta,(oldNormal-newNormal).length)
                if position>maximumPosition:maximumPosition=position;worstPosition=list(tri['indices'])
                maximumUv=max(maximumUv,uv);maximumSampleNormal=max(maximumSampleNormal,math.degrees(oldNormal.angle(newNormal)))
            cones=[]
            for ns in [tri['n'],low['n']]:
                ref=sum(ns,Vector()).normalized();cones.append(min(v.dot(ref) for v in ns))
            minimum=min(cones)
            if minimum<=0:raise RuntimeError('Normal interpolation cone is not bounded')
            bound=math.degrees(2*math.asin(min(1,delta/(2*minimum))))
            if bound>maximumNormalBound:maximumNormalBound=bound;worstNormal=list(tri['indices'])
        error=abs(covered-Area(parameter));coverageErrors.append(error)
    return {'overlapPolygons':overlays,'maximumPositionBoundM':maximumPosition,'maximumUvBound':maximumUv,'maximumNormalAngleBoundDegrees':maximumNormalBound,'maximumSampleNormalDegrees':maximumSampleNormal,'maximumParameterCoverageError':max(coverageErrors),'worstNormalSourceTriangle':worstNormal,'worstPositionSourceTriangle':worstPosition,'method':'Exact common refinement in source-grid parameter space. Position/UV and unnormalised normal-difference norms attain maxima at overlap vertices;normal angle bound uses a positive interpolation-cone norm lower bound. Float arithmetic and declared tolerances apply.'}

def RoofRecipe(source,lod):
    if len(source['p'])!=1122 or len(source['triangles'])!=2240:raise RuntimeError('Unexpected current roof source layout')
    skins=[[tri for tri in source['triangles'] if all(layer*561<=i<(layer+1)*561 for i in tri['indices'])] for layer in range(2)];sides=[tri for tri in source['triangles'] if not any(all(layer*561<=i<(layer+1)*561 for i in tri['indices']) for layer in range(2))]
    if [len(s) for s in skins]!=[1024,1024] or len(sides)!=192:raise RuntimeError('Roof source skin/shell topology changed')
    records={};maximumSplitNormal=0;maximumSplitUv=0
    for skin in skins:
        for tri in skin:
            for index,n,uv in zip(tri['indices'],tri['n'],tri['uv']):
                if index in records:
                    maximumSplitNormal=max(maximumSplitNormal,math.degrees(records[index][0].angle(n)));maximumSplitUv=max(maximumSplitUv,(records[index][1]-uv).length)
                else:records[index]=(n,uv)
    if maximumSplitNormal>.02 or maximumSplitUv>1e-6:raise RuntimeError('Roof skin requires explicit split-field sampling')
    protected={0,1,15,16};cost=[float('inf')]*17;previous=[None]*17;cost[0]=0
    for b in range(1,17):
        for a in range(b):
            if cost[a]+1>=cost[b] or any(a<k<b for k in protected):continue
            position=0;normal=0
            for row in range(a,b+1):
                t=(row-a)/(b-a)
                for layer in range(2):
                    for col in range(33):
                        index=layer*561+row*33+col;start=layer*561+a*33+col;end=layer*561+b*33+col;position=max(position,(source['p'][index]-source['p'][start].lerp(source['p'][end],t)).length);normal=max(normal,math.degrees(records[index][0].angle(records[start][0].lerp(records[end][0],t))))
            if position>.00025 or normal>1:continue
            cost[b]=cost[a]+1;previous[b]=a
    rows=[16]
    while rows[-1]:
        if previous[rows[-1]] is None:raise RuntimeError('No admissible roof sampling path')
        rows.append(previous[rows[-1]])
    rows.reverse();initial=[row*33+col for row in range(17) for col in range(33) if row in rows or col in [0,32]];selected=set(initial);history=[];forced=[set(),set()]
    for iteration in range(120):
        out,metrics=BuildRoof(source,lod,skins,sides,records,rows,sorted(selected),forced);worstIndex=max(range(2),key=lambda i:max(metrics[i]['maximumNormalAngleBoundDegrees']/2,metrics[i]['maximumPositionBoundM']/.0005));worst=metrics[worstIndex];history.append({'verticesPerSkin':len(selected),'triangles':len(out['faces']),'maximumPositionM':max(m['maximumPositionBoundM'] for m in metrics),'maximumNormalBoundDegrees':max(m['maximumNormalAngleBoundDegrees'] for m in metrics),'forcedEdgesPerSkin':list(map(len,forced))})
        if all(m['maximumPositionBoundM']<=.0005 and m['maximumNormalAngleBoundDegrees']<=2 for m in metrics):break
        key='worstPositionSourceTriangle' if worst['maximumPositionBoundM']/.0005>worst['maximumNormalAngleBoundDegrees']/2 else 'worstNormalSourceTriangle';added={i%561 for i in worst[key]}-selected
        if added:selected.update(added)
        else:
            ids=[i%561 for i in worst[key]];edges={tuple(sorted((a,b))) for a,b in zip(ids,ids[1:]+ids[:1])};newEdges=edges-forced[worstIndex]
            if not newEdges:raise RuntimeError('Roof refinement cannot repair a constrained source triangle: '+str(history[-3:]))
            forced[worstIndex].update(newEdges)
    passed=all(m['maximumPositionBoundM']<=.0005 and m['maximumNormalAngleBoundDegrees']<=2 and m['maximumParameterCoverageError']<1e-6 for m in metrics)
    return out,{'sourceTriangles':2240,'runtimeTriangles':len(out['faces']),'sourceRows':17,'sourceColumns':33,'retainedRows':rows,'initialVerticesPerSkin':len(initial),'retainedVerticesPerSkin':len(selected),'refinedSourceVertexIndices':sorted(selected-set(initial)),'forcedSourceEdgesPerSkin':list(map(len,forced)),'refinementHistory':history,'sourceBoundaryVerticesPerSkin':96,'allSourceBoundaryAndSidewallTrianglesRetained':True,'sourceSplitNormalDegrees':maximumSplitNormal,'sourceSplitUvError':maximumSplitUv,'skinBounds':metrics,'positionToleranceM':.0005,'normalToleranceDegrees':2,'passed':passed}

def BuildRoof(source,lod,skins,sides,records,rows,selected,forced):
    lookup={i:k for k,i in enumerate(selected)};points=[Param(i) for i in selected];edges=[]
    for row in rows:
        values=[i for i in selected if i//33==row];edges.extend((lookup[a],lookup[b]) for a,b in zip(values,values[1:]))
    for col in range(33):
        values=[i for i in selected if i%33==col];edges.extend((lookup[a],lookup[b]) for a,b in zip(values,values[1:]))
    out=lod.NewRecipe();metrics=[]
    for layer,skin in enumerate(skins):
        vertices,_,faces,_,_,_=delaunay_2d_cdt(points,edges+[(lookup[a],lookup[b]) for a,b in sorted(forced[layer])],[],0,1e-8,False);actual=[]
        for point in vertices:
            col,row=round(point.x),round(point.y);index=row*33+col
            if index not in lookup or (point-Param(index)).length>1e-6:raise RuntimeError('Roof CDT introduced a non-source point')
            actual.append(index)
        first=skin[0];winding=Cross(Param(first['indices'][1])-Param(first['indices'][0]),Param(first['indices'][2])-Param(first['indices'][0]));new=[]
        for face in faces:
            face=tuple(face) if winding>0 else tuple(reversed(face));ids=[actual[i]+layer*561 for i in face];ps=[source['p'][i] for i in ids];ns=[records[i][0] for i in ids];uv=[records[i][1] for i in ids];lod.AddTriangle(out,ps,ns,uv);new.append({'p':ps,'n':ns,'uv':uv,'param':[Param(i) for i in ids]})
        metrics.append(OverlayBound(skin,new))
    for tri in sides:lod.AddTriangle(out,tri['p'],tri['n'],tri['uv'])
    return out,metrics


def VerifyCurrentSamples(root,source,check):
    """Compare actual imported triangles with separately captured high surfaces."""
    names={int(k):v for k,v in root['SourcePartNames'].items()};parts={}
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        mesh=obj.data;attr=mesh.attributes.get('_SOURCE_PART_ID')
        if attr is None:continue
        normalMatrix=obj.matrix_world.to_3x3().inverted().transposed()
        for face in mesh.polygons:
            name=names[int(round(attr.data[face.vertices[0]].value))]
            if name not in source:continue
            records=[]
            for li in face.loop_indices:
                vi=mesh.loops[li].vertex_index;records.append((obj.matrix_world@mesh.vertices[vi].co,(normalMatrix@mesh.corner_normals[li].vector).normalized(),mesh.uv_layers.active.data[li].uv.copy()))
            parts.setdefault(name,[]).append(records)
    def Key(point):return tuple(round(v,6) for v in point)
    def TriangleKey(points):
        values=[Key(p) for p in points]
        return min(tuple(values[i:]+values[:i]) for i in range(3))
    rows=[]
    for name,original in source.items():
        if name=='Cabin_CamberedRoof':continue
        faces=parts.get(name,[]);points={};edges={};volume=0;missing=0;normalError=0;uvError=0;fullNut=len(original['p'])==12 and len(original['triangles'])==20;centre=sum(original['p'],Vector())/len(original['p'])
        def IndexKey(ids):return min(tuple(ids[i:]+ids[:i]) for i in range(3))
        sourceTriangles={IndexKey(list(tri['indices'])) for tri in original['triangles']}
        bins={}
        for tri in original['triangles']:
            for p,n,uv in zip(tri['p'],tri['n'],tri['uv']):bins.setdefault(Key(p),[]).append((p,n,uv))
        for face in faces:
            keys=[Key(v[0]) for v in face]
            for key,record in zip(keys,face):points[key]=record[0]
            for a,b in zip(keys,keys[1:]+keys[:1]):edge=tuple(sorted((a,b)));edges[edge]=edges.get(edge,0)+1
            volume+=(face[0][0]-centre).dot((face[1][0]-centre).cross(face[2][0]-centre))/6
            if fullNut:
                sourceIds=[]
                for p,_,_ in face:
                    candidates=[i for i,v in enumerate(original['p']) if (v-p).length<1e-6]
                    sourceIds.append(candidates[0] if len(candidates)==1 else -1)
                if -1 in sourceIds or IndexKey(sourceIds) not in sourceTriangles:missing+=1
            for p,n,uv in face:
                # Search neighbouring quantisation cells rather than trusting
                # an exact rounded key at a1um cell boundary.
                key=Key(p);near=[]
                for dx in [-1e-6,0,1e-6]:
                    for dy in [-1e-6,0,1e-6]:
                        for dz in [-1e-6,0,1e-6]:near.extend(v for v in bins.get(tuple(round(key[i]+d,6) for i,d in enumerate((dx,dy,dz))),[]) if (v[0]-p).length<1e-6)
                if not near:missing+=1;continue
                match=min(near,key=lambda v:(uv-v[2]).length+math.degrees(n.angle(v[1]))*.001);normalError=max(normalError,math.degrees(n.angle(match[1])));uvError=max(uvError,(uv-match[2]).length)
        expectedFaces=20 if fullNut else 60;expectedVertices=12 if fullNut else 32;euler=len(points)-len(edges)+len(faces);badEdges=sum(n!=2 for n in edges.values());profileError=0;gapError=0;stationCounts=[]
        if not fullNut:
            minimum=min(p.x for p in original['p']);maximum=max(p.x for p in original['p']);radius=sum(math.hypot(p.y-centre.y,p.z-centre.z) for p in original['p'])/len(original['p']);rings=[[],[]]
            for p in points.values():
                layer=0 if abs(p.x-minimum)<abs(p.x-maximum) else 1;profileError=max(profileError,abs(p.x-(minimum if layer==0 else maximum)),abs(math.hypot(p.y-centre.y,p.z-centre.z)-radius));rings[layer].append(math.atan2(p.z-centre.z,p.y-centre.y))
            stationCounts=list(map(len,rings))
            for ring in rings:
                ring.sort();gapError=max(gapError,max((abs((ring[(i+1)%len(ring)]-a)%math.tau-math.tau/16)*180/math.pi for i,a in enumerate(ring)),default=180))
        passed=len(faces)==expectedFaces and len(points)==expectedVertices and euler==2 and not badEdges and volume>1e-9 and not missing and normalError<.05 and uvError<1e-5 and (fullNut or stationCounts==[16,16] and profileError<.00002 and gapError<.001)
        row={'name':name,'triangles':len(faces),'vertices':len(points),'nonManifoldEdges':badEdges,'euler':euler,'signedVolumeM3':volume,'missingSourceCornersOrTriangles':missing,'maximumSourceNormalDegrees':normalError,'maximumSourceUvError':uvError,'axialStationCounts':stationCounts,'maximumProfileErrorM':profileError,'maximumAngularGapErrorDegrees':gapError};rows.append(row);check(passed,'Actual closed source-sampled wheel hardware: '+name,row)
    original=source['Cabin_CamberedRoof'];lookup={Key(p):i for i,p in enumerate(original['p'])};actualSkins=[[],[]];actualSides=[];unmapped=0
    for face in parts.get('Cabin_CamberedRoof',[]):
        ids=[]
        for p,n,uv in face:
            candidates=[i for i,v in enumerate(original['p']) if (v-p).length<1e-6]
            if len(candidates)!=1:unmapped+=1;ids.append(-1)
            else:ids.append(candidates[0])
        if -1 in ids:continue
        record={'p':[v[0] for v in face],'n':[v[1] for v in face],'uv':[v[2] for v in face],'indices':ids,'param':[Param(i) for i in ids]}
        if all(i<561 for i in ids):actualSkins[0].append(record)
        elif all(i>=561 for i in ids):actualSkins[1].append(record)
        else:actualSides.append(record)
    oldSkins=[[tri for tri in original['triangles'] if all(layer*561<=i<(layer+1)*561 for i in tri['indices'])] for layer in range(2)];oldSides=[tri for tri in original['triangles'] if not any(all(layer*561<=i<(layer+1)*561 for i in tri['indices']) for layer in range(2))];bounds=[OverlayBound(a,b) for a,b in zip(oldSkins,actualSkins)]
    sideKeys={TriangleKey(tri['p']) for tri in oldSides};sideExact=len(actualSides)==192 and all(TriangleKey(tri['p']) in sideKeys for tri in actualSides);boundary={row*33+col for row in range(17) for col in range(33) if row in [0,16] or col in [0,32]};boundaryExact=all(boundary<={i%561 for tri in skin for i in tri['indices']} for skin in actualSkins)
    roof={'unmappedCorners':unmapped,'sourceSidewallTrianglesRetained':sideExact,'sourceBoundaryRetained':boundaryExact,'skinBounds':bounds};check(not unmapped and sideExact and boundaryExact and all(m['maximumPositionBoundM']<=.0005 and m['maximumNormalAngleBoundDegrees']<=2 and m['maximumParameterCoverageError']<1e-6 for m in bounds),'Actual cab-roof GLB retains source perimeter and bounded complete skin fields',roof)
    return {'hardware':rows,'roof':roof,'scope':'Source captured from editable high native before actual GLB import;topology/source-corner checks for60hardware parts and common-refinement bounds on actual imported roof triangles. No declared recipe result substitutes for real geometry.'}
