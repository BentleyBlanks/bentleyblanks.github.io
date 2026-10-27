"""Independent reopen, source-to-runtime apertures and actual game motion.

The audited source and GLB are never saved by this check. Geometry comes from
the actual reimported export; no proxy can satisfy aperture/motion acceptance.
"""
import bpy,pathlib,json,hashlib,ast,math,re,os
from mathutils import Vector,Quaternion
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_ray_tri
from mathutils.geometry import barycentric_transform

scriptPath=pathlib.Path(globals().get('__file__','Taierzhuang1938/_blender/Script_NakajimaKi4ReleaseAudit.py')).resolve()
repo=scriptPath.parents[2]
asset=pathlib.Path(os.environ.get('KI4_RELEASE_ASSET_ROOT',str(repo/'tmp/NakajimaKi4/ReferenceV48_GameRelease')))
releaseRecord=json.loads((asset/'Evidence/Data_ReleaseGame.json').read_text(encoding='utf8'))
source=pathlib.Path(os.environ.get('KI4_RELEASE_SOURCE_ROOT','C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NakajimaKi4/ReferenceV48_GameRelease'))/'Scene_NakajimaKi4.blend'
Hash=lambda path:hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()
assert Hash(source)==releaseRecord['sourceSha256'] and Hash(releaseRecord['runtimePath'])==releaseRecord['runtimeSha256']
bpy.ops.wm.open_mainfile(filepath=str(source))
sourceRoot=bpy.data.objects['NakajimaKi4']
assert sourceRoot['geometryAoReleaseRebaked'] and not sourceRoot['geometryAoPending']
servicePath=scriptPath.with_name('Script_NakajimaKi4ServiceAudit.py')
service={'__file__':str(servicePath)}
exec(compile(servicePath.read_text(encoding='utf8'),str(servicePath),'exec'),service)
sourceService,probes=service['AuditServiceSource'](sourceRoot,{o.name:o for o in sourceRoot.children_recursive})
sourcePivots={o.name:o.matrix_world.copy() for o in sourceRoot.children_recursive if o.name.startswith('Pivot_')}
sourceImages={image.name:hashlib.sha256(image.packed_file.data).hexdigest() for image in bpy.data.images if image.packed_file}
assert len(sourceImages)==42 and len(sourcePivots)==10
before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=releaseRecord['runtimePath'])
new=list(set(bpy.data.objects)-before)
roots=[o for o in new if o.type=='EMPTY' and o.get('version')=='20261028ReferenceV48GameRelease']
assert len(roots)==1;root=roots[0]
runtimeService=service['AuditServiceRuntime'](new,probes)

# Reuse the established strict geometric predicate and complete 80-pose sweep.
# Only its setup/output binding changes; angles and collision gates do not.
motionPath=scriptPath.with_name('Script_NakajimaKi4AirframeMotion.py')
text=motionPath.read_text(encoding='utf8')
chunk=text[text.index('def BaseName'):text.index("proof={'state'")]
exec(compile(chunk,str(motionPath),'exec'),globals())
failed=[r for r in motion if r['staticTriangleIntersections']]+[r for r in combined if r['triangleIntersections']]+[r for r in observer if r['staticTriangleIntersections'] or r['gunObstacleTriangleIntersections']]
assert not failed,failed
assert len(motion)+len(combined)+len(observer)==80
assert max(row['radialDriftM'] for row in motion)<.00002
for name,obj in pivots.items():
    assert max(abs(obj.matrix_world[i][j]-sourcePivots[name][i][j]) for i in range(4) for j in range(4))<.000002
parts=lambda obj: list(obj.get('sourceParts',[])) or [BaseName(obj)]
sourceObjects={obj.name:obj for obj in sourceRoot.children_recursive}
normalReferences={};normalRows=[]
def NormalReference(name):
    if name not in normalReferences:
        obj=sourceObjects[name];graph=bpy.context.evaluated_depsgraph_get();evaluated=obj.evaluated_get(graph)
        mesh=evaluated.to_mesh(preserve_all_data_layers=True,depsgraph=graph);mesh.calc_loop_triangles()
        vertices=[obj.matrix_world@v.co for v in mesh.vertices];faces=[tuple(t.vertices) for t in mesh.loop_triangles]
        matrix=obj.matrix_world.to_3x3().inverted().transposed()
        normals=[[(matrix@mesh.corner_normals[i].vector).normalized() for i in tri.loops] for tri in mesh.loop_triangles]
        normalReferences[name]=(vertices,faces,normals,BVHTree.FromPolygons(vertices,faces,all_triangles=True))
        evaluated.to_mesh_clear()
    return normalReferences[name]
for obj in new:
    if obj.type!='MESH':continue
    obj.data.calc_loop_triangles();triangles=list(obj.data.loop_triangles)
    ranges=json.loads(obj.get('sourceTrianglePartRangesJson','[]')) or [{'name':BaseName(obj),'firstTriangle':0,'triangleCount':len(triangles)}]
    transform=obj.matrix_world.to_3x3().inverted().transposed()
    for row in ranges:
        name=row['name']
        if not name.startswith(('Fuselage_Monocoque','UpperWing','LowerWing','Aileron_','Tailplane_','Elevator_','Rudder','VerticalFin','Propeller_Blade','Tire_','Engine_Cylinder0','CylinderCoolingFin0_0','RockerCover0')):continue
        vv,ff,nn,tree=NormalReference(name)
        for index in sorted(set([row['firstTriangle'],row['firstTriangle']+row['triangleCount']//2,row['firstTriangle']+row['triangleCount']-1])):
            tri=triangles[index];points=[obj.matrix_world@obj.data.vertices[i].co for i in tri.vertices]
            center=sum(points,Vector())/3;face=(points[1]-points[0]).cross(points[2]-points[0]).normalized()
            hit,normal,faceIndex,distance=tree.find_nearest(center)
            nearby=tree.find_nearest_range(center,max(distance+.0001,.0001));compatible=[r for r in nearby if r[1].dot(face)>.65]
            if compatible:hit,normal,faceIndex,distance=min(compatible,key=lambda r:r[3])
            a,b,c=[vv[i] for i in ff[faceIndex]];na,nb,nc=nn[faceIndex]
            expected=barycentric_transform(hit,a,b,c,na,nb,nc).normalized()
            actual=sum(((transform@obj.data.corner_normals[i].vector).normalized() for i in tri.loops),Vector()).normalized()
            angle=math.degrees(math.acos(max(-1.,min(1.,actual.dot(expected)))))
            normalRows.append({'part':name,'triangle':index,'differenceDegrees':angle,'surfaceQueryDistanceM':distance})
assert normalRows
# A sparse high/low cap-center comparison also measures the changed
# interpolation of a simplified cap. Use the original smooth hinge-skin gate
# for high-to-low appearance, and the saved low field for export identity.
def RuntimePartReference(name):
    vertices=[];faces=[];normals=[]
    for obj in new:
        if obj.type!='MESH':continue
        obj.data.calc_loop_triangles();triangles=list(obj.data.loop_triangles)
        ranges=json.loads(obj.get('sourceTrianglePartRangesJson','[]'))or[{'name':BaseName(obj),'firstTriangle':0,'triangleCount':len(triangles)}]
        selected=[row for row in ranges if row['name']==name]
        if not selected:continue
        offset=len(vertices);vertices.extend(obj.matrix_world@v.co for v in obj.data.vertices)
        matrix=obj.matrix_world.to_3x3().inverted().transposed()
        for row in selected:
            for tri in triangles[row['firstTriangle']:row['firstTriangle']+row['triangleCount']]:
                faces.append(tuple(offset+i for i in tri.vertices));normals.append([(matrix@obj.data.corner_normals[i].vector).normalized()for i in tri.loops])
    assert faces,name
    return vertices,faces,normals,BVHTree.FromPolygons(vertices,faces,all_triangles=True)
def FieldAt(reference,point):
    vv,ff,nn,tree=reference;hit,_,index,distance=tree.find_nearest(point)
    a,b,c=[vv[i]for i in ff[index]];na,nb,nc=nn[index]
    return barycentric_transform(hit,a,b,c,na,nb,nc).normalized(),distance
hingeNormalRows=[]
for side in ['Left','Right']:
    pivot=sourceObjects['Pivot_Aileron'+side];axis=(pivot.matrix_world.to_3x3()@Vector((1,0,0))).normalized();origin=pivot.matrix_world.translation
    moving=sourceObjects['Aileron_'+side];projections=[(moving.matrix_world@v.co-origin).dot(axis)for v in moving.data.vertices]
    lo,hi=min(projections),max(projections);radius=sum(moving['hingeRadiusRangeM'])/2
    for prefix,sign in [('UpperWing_Main',1),('Aileron_',-1)]:
        name=prefix+side;high=NormalReference(name);low=RuntimePartReference(name)
        for i in range(11):
            center=origin+axis*(lo+(hi-lo)*(.065+.87*i/10))
            for factor in [.6,1.,1.5,2.5]:
                probe=center+Vector((0,sign*radius*factor,-.5));hit=high[3].ray_cast(probe,Vector((0,0,1)),1.)[0]
                assert hit is not None,('Actual underside skin beside the hinge',name,i,factor)
                expected,_=FieldAt(high,hit);actual,distance=FieldAt(low,hit)
                angle=math.degrees(math.acos(max(-1.,min(1.,expected.dot(actual)))))
                hingeNormalRows.append({'part':name,'spanSample':i,'offsetFactor':factor,'surfaceDistanceM':distance,'normalDifferenceDegrees':angle})
assert len(hingeNormalRows)==176
assert max(r['surfaceDistanceM']for r in hingeNormalRows)<.0015 and max(r['normalDifferenceDegrees']for r in hingeNormalRows)<5.,sorted(hingeNormalRows,key=lambda row:-row['normalDifferenceDegrees'])[:5]
names=sorted(set(row['part']for row in normalRows))
with bpy.data.libraries.load(str(source.parent/'Game/Scene_NakajimaKi4Parts.blend'),link=False)as(dataFrom,dataTo):dataTo.objects=list(names)
donors=dict(zip(names,dataTo.objects));lowReferences={}
def SavedWorld(obj):return SavedWorld(obj.parent)@obj.matrix_parent_inverse@obj.matrix_basis if obj.parent else obj.matrix_basis.copy()
for name,obj in donors.items():
    matrix=SavedWorld(obj);normal=matrix.to_3x3().inverted().transposed();mesh=obj.data;mesh.calc_loop_triangles()
    vv=[matrix@v.co for v in mesh.vertices];ff=[tuple(tri.vertices)for tri in mesh.loop_triangles]
    nn=[[(normal@mesh.corner_normals[i].vector).normalized()for i in tri.loops]for tri in mesh.loop_triangles]
    lowReferences[name]=(vv,ff,nn,BVHTree.FromPolygons(vv,ff,all_triangles=True))
savedFieldRows=[]
for name in names:
    actual=RuntimePartReference(name);vv,ff,nn,tree=actual
    for index in sorted(set([0,len(ff)//2,len(ff)-1])):
        center=sum((vv[i]for i in ff[index]),Vector())/3
        expected,distance=FieldAt(lowReferences[name],center);observed,_=FieldAt(actual,center)
        angle=math.degrees(math.acos(max(-1.,min(1.,expected.dot(observed)))))
        savedFieldRows.append({'part':name,'triangle':index,'differenceDegrees':angle,'surfaceDistanceM':distance})
assert max(r['differenceDegrees']for r in savedFieldRows)<1.,sorted(savedFieldRows,key=lambda row:-row['differenceDegrees'])[:5]
cowlObjects=[o for o in new if o.type=='MESH' and 'Cowl_AnnularRing' in parts(o)]
# Preserved static material groups can also include crankcase/mounts. Test the
# actual cowl against every complete imported group containing engine parts.
engineVertices=[];engineFaces=[];enginePartCounts={}
for obj in new:
    if obj.type!='MESH':continue
    obj.data.calc_loop_triangles();offset=len(engineVertices)
    engineVertices.extend(obj.matrix_world@v.co for v in obj.data.vertices)
    ranges=json.loads(obj.get('sourceTrianglePartRangesJson','[]'))
    if not ranges:ranges=[{'name':BaseName(obj),'firstTriangle':0,'triangleCount':len(obj.data.loop_triangles)}]
    assert sum(r['triangleCount'] for r in ranges)==len(obj.data.loop_triangles)
    for row in ranges:
        if not row['name'].startswith(('Engine_Cylinder','CylinderCoolingFin','RockerCover','Pushrod')):continue
        enginePartCounts[row['name']]=enginePartCounts.get(row['name'],0)+row['triangleCount']
        for tri in list(obj.data.loop_triangles)[row['firstTriangle']:row['firstTriangle']+row['triangleCount']]:
            engineFaces.append(tuple(offset+i for i in tri.vertices))
assert cowlObjects and len(enginePartCounts)==252
engineTree={'vertices':engineVertices,'faces':engineFaces,'bvh':BVHTree.FromPolygons(engineVertices,engineFaces,all_triangles=True,epsilon=0)}
cowlIntersections,cowlCandidates=Intersections(Tree(cowlObjects),engineTree)
assert cowlIntersections==0
points=[obj.matrix_world@v.co for obj in new if obj.type=='MESH' for v in obj.data.vertices]
dimensions=[max(p[k] for p in points)-min(p[k] for p in points) for k in range(3)]
assert abs(dimensions[0]-12)<.002 and abs(dimensions[1]-8.25)<.05 and abs(dimensions[2]-3.31)<.04
actualTriangles=0
for obj in new:
    if obj.type=='MESH':obj.data.calc_loop_triangles();actualTriangles+=len(obj.data.loop_triangles)
assert actualTriangles<=180000
assert Hash(source)==releaseRecord['sourceSha256'] and Hash(releaseRecord['runtimePath'])==releaseRecord['runtimeSha256']
bpy.ops.wm.open_mainfile(filepath=releaseRecord['gameSource'])
savedGame=bpy.data.objects['NakajimaKi4']
savedGameMeshes=[o for o in savedGame.children_recursive if o.type=='MESH']
savedGameTriangles=0
for obj in savedGameMeshes:
    obj.data.calc_loop_triangles();savedGameTriangles+=len(obj.data.loop_triangles)
assert savedGameTriangles==actualTriangles and savedGame['highSourceSha256']==releaseRecord['sourceSha256']
assert len([o for o in savedGame.children_recursive if o.name.startswith('Pivot_')])==10
assert all(o.data.uv_layers[0].name=='UVMap' and o.data.uv_layers.get('GeometryAO') for o in savedGameMeshes)
gameReopened={'path':releaseRecord['gameSource'],'sha256':Hash(releaseRecord['gameSource']),'reopened':True,'triangles':savedGameTriangles,
              'meshes':len(savedGameMeshes),'packedImages':len([i for i in bpy.data.images if i.packed_file]),'pivots':10}
record={'state':'ActualSavedHighAndGameGlbReopenedAndAudited','sourcePath':str(source),'sourceSha256':releaseRecord['sourceSha256'],
        'gameSourcePath':releaseRecord['gameSource'],'gameSourceSha256':releaseRecord['gameSourceSha256'],'runtimeSha256':releaseRecord['runtimeSha256'],
        'actualGlbReimport':True,'sourcePackedImages':sourceImages,'sourceServiceAudit':sourceService,'gameSourceReopened':gameReopened,
        'runtimeServiceAudit':runtimeService,'singlePivotSamples':motion,'coupledTailSamples':combined,
        'coupledObserverSamples':observer,'motionSamples':80,'trueMotionTriangleIntersections':0,
        'cowlEngineClearance':{'trueTriangleIntersections':0,'bvhCandidates':cowlCandidates,'actualImportedEngineParts':len(enginePartCounts),'partTriangleCounts':enginePartCounts,'actualImportedEngineTriangles':len(engineFaces)},
        'actualHighToGameNormalField':{'smoothHingeSamples':hingeNormalRows,'maxDifferenceDegrees':max(row['normalDifferenceDegrees'] for row in hingeNormalRows),'toleranceDegrees':5.,'maxSurfaceDistanceM':max(row['surfaceDistanceM']for row in hingeNormalRows)},
        'savedLowToActualRuntimeNormalField':{'samples':savedFieldRows,'maxDifferenceDegrees':max(row['differenceDegrees']for row in savedFieldRows),'toleranceDegrees':1.},
        'highLowCapAndSurfaceInterpolationDiagnostic':{'samples':normalRows,'maxDifferenceDegrees':max(row['differenceDegrees']for row in normalRows),'scope':'Diagnostic includes cap-center interpolation changes; not an export-coordinate identity gate.'},
        'dimensionsBlenderXyzM':dimensions,'triangles':actualTriangles,
        'wheelStaticContactIntersectionsIntentionallyNotTested':True,
        'scope':'Finite real game-pivot samples and source aperture probes. Photo-fit failures remain separate; this does not prove every continuous angle.'}
for folder in [asset/'Evidence',source.parent/'Evidence']:
    (folder/'Data_ReleaseReopenAndMotion.json').write_text(json.dumps(record,indent=2),encoding='utf8')
result={key:record[key] for key in ['state','motionSamples','triangles','dimensionsBlenderXyzM']}
print(json.dumps(result),flush=True)
