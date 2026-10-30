"""Latest high-source game geometry, with explicit unchanged-component proofs.

Only exactly corresponding old surfaces inherit the V59 continuous bound.
New suspension and gun surfaces receive new bounds or remain exact. Fresh low
UVs and high-to-low PBR projection are a separate, required production phase.
"""
import ast,bpy,bmesh,hashlib,importlib.util,json,math,os,time,numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
repo=Path(os.environ.get('TYPE94_REPO_ROOT',str(Path(__file__).resolve().parents[2])))
base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=Path(os.environ.get('TYPE94_GAME_ROOT',str(base/'GameTrialV70')));acc=root/'Acceptance'
for directory in [root,acc,root/'Exports',root/'Rebuild']:directory.mkdir(parents=True,exist_ok=True)
assert not bpy.data.filepath
highManifest=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_SurfaceStudyV68.json').read_text())
oldHighManifest=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_SurfaceStudyV56.json').read_text())
oldManifest=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_GameTrialV59.json').read_text())
oldProof=json.loads((base/'GameTrialV59/Acceptance/Data_GameTrialReductionV59.json').read_text())
certificate=json.loads((base/'GameTrialV59/Acceptance/Data_ComposedActualSurfaceCertificateV59.json').read_text())
delta=json.loads((acc/'Data_GameDeltaV70.json').read_text())
assert certificate['passed']and certificate['sha256']==oldManifest['sha256']==oldProof['sha256']==delta['low']['sha256']
assert certificate['referenceSha256']==oldHighManifest['sha256']==delta['old']['sha256']
assert highManifest['sha256']==delta['current']['sha256']
for manifest in [oldManifest,oldHighManifest,highManifest]:
    assert hashlib.sha256(Path(manifest['sourceBlend']).read_bytes()).hexdigest()==manifest['sourceBlendSha256']
    assert hashlib.sha256(Path(manifest['sourceGlb']).read_bytes()).hexdigest()==manifest['sha256']
file=repo/'Taierzhuang1938/_blender/Script_Type94Export.py';spec=importlib.util.spec_from_file_location('LatestGameExport',file);exporter=importlib.util.module_from_spec(spec);spec.loader.exec_module(exporter)
scope=dict(bpy=bpy,bmesh=bmesh,np=np,math=math,Vector=Vector,BVHTree=BVHTree,CERT_LIMIT=.002998,exporter=exporter)
for file,names in [('Script_Type94GameTrial.py',['Count','Surface','SampleError','Certify','LooseParts','Reduce']),('Script_Type94GameFeatures.py',['State','Make','Restore','Split','Transfer','Planar','Lathe','Combine'])]:
    tree=ast.parse((repo/'Taierzhuang1938/_blender'/file).read_text());exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name in names],type_ignores=[]),'<certified geometry functions>','exec'),scope)
globals().update({k:v for k,v in scope.items()if callable(v)and k not in ['Vector','BVHTree']})
started=time.time()
def Signature(mesh,ids=None):
    faces=list(mesh.polygons)if ids is None else[mesh.polygons[i]for i in ids]
    sites=np.array([tuple(v.co)for v in mesh.vertices],dtype='<f4');used=sorted({i for p in faces for i in p.vertices});points,inverse=np.unique(sites[used],axis=0,return_inverse=True);lookup=dict(zip(used,inverse));indices=np.array([[lookup[i]for i in p.vertices]for p in faces],dtype='<i8');assert indices.shape[1]==3
    indices=np.array([np.roll(t,-int(np.argmin(t)))for t in indices],dtype='<i8');indices=indices[np.lexsort(indices.T[::-1])]
    return hashlib.sha256(points.tobytes()+indices.tobytes()).hexdigest()
def Exact(source,method):
    return dict(sourceTriangles=Count(source),candidateTriangles=Count(source),exactRetained=True,method=method,forward=dict(certified=True,certifiedUpperM=0.),reverse=dict(certified=True,certifiedUpperM=0.),sourceSignature=Signature(source),lowSignature=Signature(source))
def LockChannelPlanes(mesh,source):
    layout=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_RunningAssemblyV61.json').read_text());section=layout['armChannelSection'];front=layout['trackCenterXM']+section['axialCenterOffsetM']+section['thicknessM']/2;planes=[front,front-section['thicknessM'],front-section['recessDepthM']];side=-1 if sum(v.co.x for v in source.vertices)<0 else 1
    # A generic planar dissolve can bridge the tiny edge bevel and shift the
    # flat web/rim by fractions of a millimetre. Preserve the declared real
    # front, back and recessed floor; the high-to-low normal bake carries bevels.
    for vertex in mesh.vertices:vertex.co.x=side*min(planes,key=lambda p:abs(abs(vertex.co.x)-p))
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-8);bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=1e-9);empty=[v for v in bm.verts if not v.link_faces]
    if empty:bmesh.ops.delete(bm,geom=empty,context='VERTS')
    bm.to_mesh(mesh);bm.free();mesh.update();return exporter.TriangulatedCopy(Transfer(mesh,source))
def CurrentSlots(mesh,source):
    # V66 introduced an inferred paint coating on the outward road annuli.
    # Carry current high material boundaries rather than old V59 assignments.
    if mesh==source:return mesh
    mesh.materials.clear()
    for material in source.materials:mesh.materials.append(material)
    source.calc_loop_triangles();triangles=list(source.loop_triangles);tree=BVHTree.FromPolygons([v.co for v in source.vertices],[t.vertices for t in triangles],all_triangles=True)
    for face in mesh.polygons:
        centre=sum((mesh.vertices[i].co for i in face.vertices),Vector())/len(face.vertices);hit=tree.find_nearest(centre);face.material_index=source.polygons[triangles[hit[2]].polygon_index].material_index
    return mesh
bpy.ops.wm.open_mainfile(filepath=oldManifest['sourceBlend'])
oldStates={r['mesh']:State(bpy.data.objects[r['mesh']].data)for r in oldProof['records']}
for name,state in oldStates.items():assert Count(bpy.data.objects[name].data)==delta['low']['meshes'][name]['triangles']
bpy.ops.wm.open_mainfile(filepath=highManifest['sourceBlend']);scene=bpy.context.scene;scope['scene']=scene
assert scene.get('BlenderMcpTask')=='Type94Tankette'
scene.render.threads_mode='FIXED';scene.render.threads=4
asset=bpy.data.objects['Type94Tankette'];actual={asset}|set(asset.children_recursive);records=[]
for number,priorRecord in enumerate(oldProof['records']):
    name=priorRecord['mesh'];obj=bpy.data.objects[name];shared=obj.data;users=sorted([o for o in actual if o.type=='MESH'and o.data==shared],key=lambda o:o.name);high=exporter.TriangulatedCopy(shared)
    assert Signature(high)==delta['current']['meshes'][name]['signature']
    state=oldStates[name];state['materials']=[m.name for m in high.materials];old=Restore(state)
    assert Signature(old)==delta['low']['meshes'][name]['signature']
    previousHigh=delta['old']['meshes'][name]
    if Signature(high)==previousHigh['signature']:
        low=old;parts=[dict(p,inheritedFrom=dict(revision='V59',mesh=name,part=i))for i,p in enumerate(priorRecord['parts'])]
        strategy='Exact unchanged high and low surfaces inherit the V59 bound'
    elif name=='Geometry_Hull_Paint':
        oldParts=previousHigh['parts'];lookup={p['signature']:i for i,p in enumerate(oldParts)};assert len(lookup)==len(oldParts)
        parts=[];meshes=[]
        for index,ids in enumerate(LooseParts(high)):
            source=Split(high,ids);signature=Signature(source)
            if signature in lookup:
                candidate,row=scope['Reduce'](source,'Paint',name);row.update(method='Fresh current-source local reduction; no old Hull face-offset inheritance',sourceSignature=signature,lowSignature=Signature(candidate))
            else:
                candidate=Lathe(source);method='Coherent rounded pivot profile'
                if candidate is None:candidate=Planar(source);method='Planar channel faces with intact recessed boundary'
                candidate=exporter.TriangulatedCopy(candidate)
                if Count(candidate)>Count(source)*.5:candidate,row=scope['Reduce'](source,'Paint',name);method='New conservative local decimation'
                else:
                    f=Certify(source,candidate);r=Certify(candidate,source)
                    if f['certified']and r['certified']:row=dict(sourceTriangles=Count(source),candidateTriangles=Count(candidate),exactRetained=False,forward=f,reverse=r)
                    else:candidate,row=scope['Reduce'](source,'Paint',name);method='New conservative local decimation after profile fallback'
                row.update(method=method,sourceSignature=signature,lowSignature=Signature(candidate))
            meshes.append(candidate);parts.append(row)
            print('TYPE94_V70_CURRENT_HULL_PART',index,Count(source),Count(candidate),flush=True)
        low=Combine(meshes,[m.name for m in high.materials]);strategy='All202current Hull components freshly reduced and continuously certified; no Hull inheritance'
    else:
        low=high;parts=[Exact(Split(high,ids),'Exact latest gun feature; no old geometry substituted')for ids in LooseParts(high)];strategy='Exact current high gun geometry'
    low=CurrentSlots(low,high)
    for user in users:user.data=low
    record=dict(mesh=name,role=priorRecord['role'],instances=len(users),sourceTriangles=Count(high),candidateTriangles=Count(low),looseParts=len(LooseParts(high)),parts=parts,strategy=strategy,sourceSignature=Signature(high),lowSignature=Signature(low),highSourceUnchanged=Signature(high)==previousHigh['signature'])
    records.append(record);(acc/'Data_GameGeometryProgressV70.json').write_text(json.dumps(dict(completedGroups=number+1,totalGroups=len(oldProof['records']),records=records,elapsedSeconds=time.time()-started),indent=2)+'\n');print('TYPE94_V70_GROUP',number+1,name,Count(high),Count(low),flush=True)
total=sum(r['candidateTriangles']*r['instances']for r in records);within=total<80000;locked=0
blend=root/'Scene_Type94TanketteGameGeometryV70.blend';scene['GameTrialRevision']='GameGeometryV70';scene['WholeReferenceAccepted']=False;scene['GamePbrProjectionAccepted']=False;scene['GameHighSourceSha256']=highManifest['sha256'];scene['GameChannelPlanesLocked']=False;bpy.ops.wm.save_as_mainfile(filepath=str(blend))
bpy.ops.object.select_all(action='DESELECT')
for obj in actual:obj.select_set(True)
glb=root/'Exports/Model_Type94TanketteGameGeometryV70.glb';exporter.ExportGltf(glb)
report=dict(schema='Type94LatestBoundedGameGeometryV1',sourceGlbSha256=highManifest['sha256'],referenceBlendSha256=highManifest['sourceBlendSha256'],priorGlbSha256=oldManifest['sha256'],priorBlendSha256=oldManifest['sourceBlendSha256'],priorCertificate='GameTrialV59/Acceptance/Data_ComposedActualSurfaceCertificateV59.json',triangles=total,withinBudget=within,triangleLimitExclusive=80000,allLocalSurfacesCertified=all(p['forward']['certified']and p['reverse']['certified']for r in records for p in r['parts']),records=records,sourceBlend=str(blend),sourceBlendSha256=hashlib.sha256(blend.read_bytes()).hexdigest(),sourceGlb=str(glb),sha256=hashlib.sha256(glb.read_bytes()).hexdigest(),elapsedSeconds=time.time()-started,wholeReferenceAccepted=False,gameDerivativeAccepted=False,complete=False,textureScope='Retained high PBR is a geometry checkpoint only; fresh low UV and high-to-low projection are required')
report['channelPlanesLocked']=locked;(acc/'Data_GameGeometryV70.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(triangles=total,withinBudget=within,allCertified=report['allLocalSurfacesCertified'],sha256=report['sha256']),indent=2),flush=True)
