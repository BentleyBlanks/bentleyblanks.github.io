"""Resume a V70 build by locking only its eight current channel sections.

Every retained part is checked against its exact current source signature.
The regular full build applies the same operation directly in Geometry.
"""
import ast,bpy,bmesh,hashlib,importlib.util,json,math,os,numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=Path(os.environ.get('TYPE94_GAME_ROOT',str(base/'GameTrialV70')));acc=root/'Acceptance';report=json.loads((acc/'Data_GameGeometryV70.json').read_text());high=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_SurfaceStudyV68.json').read_text());assert report['sourceGlbSha256']==high['sha256'];assert not bpy.data.filepath
for manifest in [report,high]:assert hashlib.sha256(Path(manifest['sourceBlend']).read_bytes()).hexdigest()==manifest['sourceBlendSha256']
file=repo/'Taierzhuang1938/_blender/Script_Type94Export.py';spec=importlib.util.spec_from_file_location('PatchExport',file);exporter=importlib.util.module_from_spec(spec);spec.loader.exec_module(exporter);scope=dict(bpy=bpy,bmesh=bmesh,np=np,math=math,Vector=Vector,BVHTree=BVHTree,CERT_LIMIT=.002998,hashlib=hashlib,json=json,repo=repo,exporter=exporter)
for file,names in [('Script_Type94GameTrial.py',['Count','Surface','Certify','LooseParts']),('Script_Type94GameFeatures.py',['State','Make','Restore','Split','Transfer','Combine']),('Script_Type94GameGeometryV70.py',['Signature','LockChannelPlanes'])]:
    tree=ast.parse((repo/'Taierzhuang1938/_blender'/file).read_text());exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name in names],type_ignores=[]),'<audited current channel patch>','exec'),scope)
Count=scope['Count'];Split=scope['Split'];Signature=scope['Signature'];Certify=scope['Certify'];bpy.ops.wm.open_mainfile(filepath=report['sourceBlend']);scene=bpy.context.scene;assert scene.get('BlenderMcpTask')=='Type94Tankette';asset=bpy.data.objects['Type94Tankette'];actual={asset}|set(asset.children_recursive);obj=bpy.data.objects['Geometry_Hull_Paint'];current=exporter.TriangulatedCopy(obj.data);record=next(r for r in report['records']if r['mesh']==obj.name);assert Signature(current)==record['lowSignature'];originalGlb=report['sha256']
with bpy.data.libraries.load(high['sourceBlend'],link=False)as(available,loaded):loaded.objects=['Geometry_Hull_Paint']
source=exporter.TriangulatedCopy(loaded.objects[0].data);sources={Signature(Split(source,ids)):ids for ids in scope['LooseParts'](source)};meshes=[];offset=0;patched=0
for part in record['parts']:
    candidate=Split(current,list(range(offset,offset+part['candidateTriangles'])));offset+=part['candidateTriangles'];assert Signature(candidate)==part['lowSignature'];ids=sources[part['sourceSignature']]
    if part['sourceTriangles']==828:
        exact=Split(source,ids);candidate=scope['LockChannelPlanes'](candidate,exact);f=Certify(exact,candidate);r=Certify(candidate,exact);assert f['certified']and r['certified'];part.update(candidateTriangles=Count(candidate),exactRetained=False,forward=f,reverse=r,method='Planar channel with locked front, back and recessed floor',lowSignature=Signature(candidate));patched+=1
    meshes.append(candidate)
assert offset==Count(current)and patched==8;obj.data=scope['Combine'](meshes,[m.name for m in current.materials]);record.update(candidateTriangles=Count(obj.data),lowSignature=Signature(obj.data),strategy='All202current Hull components certified, with8locked channel sections');bpy.data.objects.remove(loaded.objects[0],do_unlink=True);report['triangles']=sum(r['candidateTriangles']*r['instances']for r in report['records']);report['withinBudget']=report['triangles']<80000;assert report['withinBudget'];report['channelPlanePatchPreviousGeometrySha256']=originalGlb;report['channelPlanesLocked']=8;scene['GameChannelPlanesLocked']=True;bpy.ops.wm.save_as_mainfile(filepath=report['sourceBlend']);bpy.ops.object.select_all(action='DESELECT')
for item in actual:item.select_set(True)
exporter.ExportGltf(report['sourceGlb']);report['sourceBlendSha256']=hashlib.sha256(Path(report['sourceBlend']).read_bytes()).hexdigest();report['sha256']=hashlib.sha256(Path(report['sourceGlb']).read_bytes()).hexdigest();(acc/'Data_GameGeometryV70.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(triangles=report['triangles'],lockedChannels=patched,sha256=report['sha256']),indent=2),flush=True)
