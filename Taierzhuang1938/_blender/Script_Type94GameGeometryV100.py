"""Current rig/geometry with exact prior-surface inheritance and fresh3mm bounds."""
import ast,bpy,bmesh,hashlib,importlib.util,json,math,os,time,numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=Path(os.environ.get('TYPE94_GAME_ROOT',str(base/'GameTrialV100')));acc=root/'Acceptance'
for directory in [root,acc,root/'Exports',root/'Rebuild']:directory.mkdir(parents=True,exist_ok=True)
assert not bpy.data.filepath
highManifest=json.loads((Path(os.environ.get('TYPE94_HIGH_ROOT',str(base/'SurfaceV99')))/'Acceptance/Data_CurrentPbrV99.json').read_text());oldManifest=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_GameTrialV70.json').read_text());delta=json.loads((acc/'Data_GameDeltaV100.json').read_text());prior=json.loads((base/'GameTrialV70/Acceptance/Data_GameGeometryV70.json').read_text());certificate=json.loads((base/'GameTrialV70/Acceptance/Data_ComposedActualSurfaceCertificateV70.json').read_text())
assert certificate['passed']and certificate['sha256']==oldManifest['sha256']and certificate['referenceSha256']==delta['old']['sha256']
for m in [highManifest,oldManifest]:assert hashlib.sha256(Path(m['sourceBlend']).read_bytes()).hexdigest()==m['sourceBlendSha256']
spec=importlib.util.spec_from_file_location('Geometry100Export',repo/'Taierzhuang1938/_blender/Script_Type94Export.py');exporter=importlib.util.module_from_spec(spec);spec.loader.exec_module(exporter)
scope=dict(bpy=bpy,bmesh=bmesh,np=np,math=math,Vector=Vector,BVHTree=BVHTree,hashlib=hashlib,CERT_LIMIT=.002998)
for name,names in [('Script_Type94GameTrial.py',['Count','Surface','SampleError','Certify','LooseParts']),('Script_Type94GameFeatures.py',['State','Make','Restore','Split','Transfer','Planar','Lathe','Combine']),('Script_Type94GameDeltaV70.py',['Signature'])]:
    file=repo/'Taierzhuang1938/_blender'/name;syntax=ast.parse(file.read_text());exec(compile(ast.Module(body=[n for n in syntax.body if isinstance(n,ast.FunctionDef)and n.name in names],type_ignores=[]),str(file),'exec'),scope)
Count=scope['Count'];Signature=scope['Signature'];Split=scope['Split'];LooseParts=scope['LooseParts'];Certify=scope['Certify'];started=time.time();records=[]
bpy.ops.wm.open_mainfile(filepath=oldManifest['sourceBlend']);oldStates={r['mesh']:scope['State'](bpy.data.objects[r['mesh']].data)for r in prior['records']};oldRecords={r['mesh']:r for r in prior['records']}
# Build verified Hull part pairs before opening the current high source.
oldHull=scope['Restore'](oldStates['Geometry_Hull_Paint']);hullLookup={};offset=0
for part in oldRecords['Geometry_Hull_Paint']['parts']:
    low=Split(oldHull,list(range(offset,offset+part['candidateTriangles'])));offset+=part['candidateTriangles'];assert Signature(low)==part['lowSignature'];hullLookup[part['sourceSignature']]=dict(state=scope['State'](low),certificate=part)
assert offset==Count(oldHull)
bpy.ops.wm.open_mainfile(filepath=highManifest['sourceBlend']);scene=bpy.context.scene;assert scene.get('BlenderMcpTask')=='Type94Tankette';scene.render.threads_mode='FIXED';scene.render.threads=4;asset=bpy.data.objects['Type94Tankette'];actual=[asset,*asset.children_recursive];scope['scene']=scene
groups={}
for obj in sorted(actual,key=lambda o:o.name):
    if obj.type=='MESH':groups.setdefault(obj.data.as_pointer(),[]).append(obj)
def Exact(source,method):return dict(sourceTriangles=Count(source),candidateTriangles=Count(source),exactRetained=True,sourceSignature=Signature(source),lowSignature=Signature(source),method=method,forward=dict(certified=True,certifiedUpperM=0.),reverse=dict(certified=True,certifiedUpperM=0.))
def Test(source,candidate,method,trials):
    candidate=exporter.TriangulatedCopy(candidate);fSample=scope['SampleError'](source,candidate);rSample=scope['SampleError'](candidate,source);row=dict(method=method,triangles=Count(candidate),sampleForward=fSample,sampleReverse=rSample);trials.append(row)
    if max(fSample['maximumM'],rSample['maximumM'])>.00285:return None
    forward=Certify(source,candidate);reverse=Certify(candidate,source);row.update(forward=forward,reverse=reverse)
    if not(forward['certified']and reverse['certified']):return None
    return candidate,dict(sourceTriangles=Count(source),candidateTriangles=Count(candidate),exactRetained=False,sourceSignature=Signature(source),lowSignature=Signature(candidate),method=method,forward=forward,reverse=reverse,trials=trials)
def Reduce(source,name,role):
    n=Count(source)
    if n<=32:return source,Exact(source,'Exact small current feature')
    trials=[]
    for method,fn in [('Coherent section with conservative bore',scope['Lathe']),('Planar dissolution',scope['Planar'])]:
        candidate=fn(source)
        if candidate is None or Count(candidate)>min(n*.5,2000 if n>10000 else n):continue
        result=Test(source,candidate,method,trials)
        if result:return result
    ratios=[.003,.0045,.006,.009,.012,.018,.03,.05,.08,.13,.20,.35,.55,.75]if n>10000 else[.08,.12,.18,.28,.40,.60,.80]
    if role=='Track':ratios=[min(.999,target/n)for target in [170,176,180,184,188,190,200,220,260,320]]
    temp=bpy.data.objects.new('Temporary_Game100Reduction',source);scene.collection.objects.link(temp)
    try:
        for ratio in ratios:
            candidate=source.copy();temp.data=candidate;bpy.ops.object.select_all(action='DESELECT');temp.select_set(True);bpy.context.view_layer.objects.active=temp;mod=temp.modifiers.new('Current bounded reduction','DECIMATE');mod.ratio=ratio;mod.use_collapse_triangulate=True
            if role=='Track':mod.use_symmetry=True;mod.symmetry_axis='X'
            bpy.ops.object.modifier_apply(modifier=mod.name);candidate=temp.data;candidate=scope['Transfer'](candidate,source);result=Test(source,candidate,'Current local QEM ratio'+str(ratio),trials)
            print('TYPE94_GAME100_TRIAL',name,n,Count(candidate),bool(result),flush=True)
            if result:return result
    finally:bpy.data.objects.remove(temp,do_unlink=True)
    row=Exact(source,'Exact fallback after conservative bounds');row['trials']=trials;return source,row
for groupNumber,users in enumerate(groups.values()):
    obj=users[0];name=obj.name;source=exporter.TriangulatedCopy(obj.data);signature=Signature(source);assert signature==delta['current']['meshes'][name]['signature'];materials=[m.name for m in source.materials];role=obj.get('SurfaceRole','Paint');strategy='';parts=[]
    unchanged=name in delta['old']['meshes']and signature==delta['old']['meshes'][name]['signature']
    if unchanged and role!='Track':
        state=dict(oldStates[name]);state['materials']=materials;low=scope['Restore'](state);assert Signature(low)==delta['low']['meshes'][name]['signature'];parts=[dict(p,inheritedFrom=dict(revision='V70',mesh=name,part=i))for i,p in enumerate(oldRecords[name]['parts'])];strategy='Exact paired high/low surfaces inherit validated V70bounds'
    elif role=='Track':
        low,row=Reduce(source,name,role);parts=[row];strategy='Fresh current shared shoe reduction and continuous proof'
    else:
        reduced=[]
        for index,ids in enumerate(LooseParts(source)):
            part=Split(source,ids);key=Signature(part)
            if name=='Geometry_Hull_Paint'and key in hullLookup:
                saved=hullLookup[key];state=dict(saved['state']);state['materials']=materials;candidate=scope['Restore'](state);row=dict(saved['certificate'],inheritedFrom=dict(revision='V70',mesh=name,sourceSignature=key));assert Signature(candidate)==row['lowSignature']
            else:candidate,row=Reduce(part,name+'_'+str(index),role)
            reduced.append(candidate);parts.append(row);print('TYPE94_GAME100_PART',name,index,Count(part),Count(candidate),flush=True)
        low=scope['Combine'](reduced,materials);strategy='Exact retained component pairs plus freshly certified changed parts'
    for user in users:user.data=low
    records.append(dict(mesh=name,role=role,instances=len(users),sourceTriangles=Count(source),candidateTriangles=Count(low),sourceSignature=signature,lowSignature=Signature(low),parts=parts,strategy=strategy))
    (acc/'Data_GameGeometryProgressV100.json').write_text(json.dumps(dict(completedGroups=groupNumber+1,totalGroups=len(groups),records=records,elapsedSeconds=time.time()-started),indent=2)+'\n');print('TYPE94_GAME100_GROUP',groupNumber+1,name,Count(low),flush=True)
total=sum(r['candidateTriangles']*r['instances']for r in records);scene['GameTrialRevision']='GameGeometryV100';scene['WholeReferenceAccepted']=False;scene['GameHighSourceSha256']=highManifest['sha256'];scene['GameUvGenerationMode']='PendingFreshProjection';destination=root/'Scene_Type94TanketteGameGeometryV100.blend';bpy.ops.wm.save_as_mainfile(filepath=str(destination));bpy.ops.object.select_all(action='DESELECT')
for obj in actual:obj.select_set(True)
glb=root/'Exports/Model_Type94TanketteGameGeometryV100.glb';exporter.ExportGltf(glb)
report=dict(sourceHigh=highManifest,sourceBlend=str(destination),sourceBlendSha256=hashlib.sha256(destination.read_bytes()).hexdigest(),sourceGlb=str(glb),sha256=hashlib.sha256(glb.read_bytes()).hexdigest(),triangles=total,withinBudget=total<80000,triangleLimitExclusive=80000,allLocalSurfacesCertified=all(p['forward']['certified']and p['reverse']['certified']for r in records for p in r['parts']),records=records,elapsedSeconds=time.time()-started,wholeReferenceAccepted=False,gameDerivativeAccepted=False,projectionPending=True)
locked=sum('locked front, back and recessed floor'in p.get('method','')for r in records if r['mesh']=='Geometry_Hull_Paint'for p in r['parts']);assert locked==8
report.update(sourceGlbSha256=highManifest['sha256'],referenceBlendSha256=highManifest['sourceBlendSha256'],channelPlanesLocked=locked,planeLockMethod='Exact inherited V70current channel component pairs')
(acc/'Data_GameGeometryV100.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(triangles=total,withinBudget=report['withinBudget'],allCertified=report['allLocalSurfacesCertified'])),flush=True)
