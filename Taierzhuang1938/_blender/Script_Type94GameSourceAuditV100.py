"""Bind current final high/low sources to actual arrays and fresh part certificates."""
import ast,bpy,bmesh,hashlib,importlib.util,json,math,os,numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=Path(os.environ.get('TYPE94_GAME_ROOT',str(base/'GameTrialV100')));acc=root/'Acceptance';assert not bpy.data.filepath
high=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_SurfaceStudyV99.json').read_text());low=json.loads((acc/'Data_GamePbrV100.json').read_text());geometry=json.loads((acc/'Data_GameGeometryV100.json').read_text());delta=json.loads((acc/'Data_GameDeltaV100.json').read_text());checks=[];certificates=[]
def Check(value,label):checks.append(dict(passed=bool(value),check=label))
spec=importlib.util.spec_from_file_location('Source100Export',repo/'Taierzhuang1938/_blender/Script_Type94Export.py');exporter=importlib.util.module_from_spec(spec);spec.loader.exec_module(exporter)
scope=dict(bpy=bpy,bmesh=bmesh,np=np,math=math,Vector=Vector,BVHTree=BVHTree,hashlib=hashlib,CERT_LIMIT=.002998)
for name,names in [('Script_Type94GameTrial.py',['Count','Surface','Certify','LooseParts']),('Script_Type94GameFeatures.py',['State','Make','Restore','Split']),('Script_Type94GameDeltaV70.py',['Signature'])]:
    file=repo/'Taierzhuang1938/_blender'/name;syntax=ast.parse(file.read_text());exec(compile(ast.Module(body=[n for n in syntax.body if isinstance(n,ast.FunctionDef)and n.name in names],type_ignores=[]),str(file),'exec'),scope)
Count=scope['Count'];Signature=scope['Signature'];Split=scope['Split'];sourceStates={};sourceSignatures={}
for label,m in [('High',high),('Low',low)]:
    assert hashlib.sha256(Path(m['sourceBlend']).read_bytes()).hexdigest()==m['sourceBlendSha256'];bpy.ops.wm.open_mainfile(filepath=m['sourceBlend']);scene=bpy.context.scene;assert scene.get('BlenderMcpTask')=='Type94Tankette';asset=bpy.data.objects['Type94Tankette'];meshes=sorted([o for o in asset.children_recursive if o.type=='MESH'],key=lambda o:o.name);arrays={};rows=[];unique={}
    for i,obj in enumerate(meshes):
        mesh=exporter.TriangulatedCopy(obj.data);p=np.array([tuple(v.co)for v in mesh.vertices],dtype=float);t=np.array([tuple(f.vertices)for f in mesh.polygons],dtype=np.int64);arrays['points'+str(i)]=p[:,[0,2,1]]*[1,1,-1];arrays['triangles'+str(i)]=t;rows.append(dict(index=i,name=obj.name,triangles=len(t)));unique[obj.name]=mesh
    np.savez_compressed(acc/('Data_'+label+'SourceArraysV100.npz'),**arrays);(acc/('Data_'+label+'SourceArraysV100.json')).write_text(json.dumps(dict(source=m['sourceBlend'],sourceBlendSha256=m['sourceBlendSha256'],rows=rows),indent=2)+'\n');Check(len(meshes)==240,label+'actual source has240mesh owners')
    if label=='High':
        for r in geometry['records']:
            mesh=unique[r['mesh']];sourceSignatures[r['mesh']]=Signature(mesh);assert sourceSignatures[r['mesh']]==r['sourceSignature']
            if not r['strategy'].startswith('Exact paired'):sourceStates[r['mesh']]=scope['State'](mesh)
        continue
    Check(sum(Count(o.data)for o in meshes)==low['triangles']<80000,'Actual final saved low remains below80000triangles')
    for role,size in [('Paint',4096),('Track',2048),('Steel',2048),('Rubber',1024)]:
        tree=bpy.data.materials['Material_Type94'+role].node_tree;images={c:tree.nodes['Baked '+c].image for c in ['Base','Orm','Normal']};Check(all(i.packed_file and tuple(i.size)==(size,size)for i in images.values()),role+' complete packed PBR');Check(images['Base'].colorspace_settings.name=='sRGB'and images['Orm'].colorspace_settings.name==images['Normal'].colorspace_settings.name=='Non-Color',role+' color/data encoding');Check(abs(tree.nodes['Tangent normal, OpenGL +Y'].inputs['Strength'].default_value-1)<1e-8,role+' normal response applied once')
    for r in geometry['records']:
        name=r['mesh'];target=unique[name];assert Signature(target)==r['lowSignature']
        if r['strategy'].startswith('Exact paired'):
            identity=sourceSignatures[name]==delta['old']['meshes'][name]['signature']and Signature(target)==delta['low']['meshes'][name]['signature'];Check(identity,'Exact inherited whole-source pair: '+name);certificates.append(dict(mesh=name,inheritedWhole=True,passed=identity,maximumLocalBoundM=max(max(p['forward'].get('certifiedUpperM')or 0,p['reverse'].get('certifiedUpperM')or 0)for p in r['parts'])));continue
        source=scope['Restore'](sourceStates[name]);components=[list(range(len(source.polygons)))]if r['role']=='Track'else scope['LooseParts'](source);assert len(components)==len(r['parts']);offset=0
        for i,(ids,p)in enumerate(zip(components,r['parts'])):
            a=Split(source,ids);b=Split(target,list(range(offset,offset+p['candidateTriangles'])));offset+=p['candidateTriangles'];identity=Signature(a)==p['sourceSignature']and Signature(b)==p['lowSignature'];assert identity
            if p.get('inheritedFrom'):forward=p['forward'];reverse=p['reverse'];kind='Exact inherited current Hull component pair'
            elif p.get('exactRetained'):assert Signature(a)==Signature(b);forward=dict(certified=True,certifiedUpperM=0.);reverse=dict(forward);kind='Exact current feature'
            else:forward=scope['Certify'](a,b);reverse=scope['Certify'](b,a);kind='Fresh saved-source continuous proof'
            row=dict(mesh=name,index=i,identity=identity,method=kind,forward=forward,reverse=reverse,passed=bool(forward['certified']and reverse['certified']),maximumLocalBoundM=max(forward.get('certifiedUpperM')or 0,reverse.get('certifiedUpperM')or 0));certificates.append(row);print('TYPE94_GAME100_SOURCE_PART',name,i,row['passed'],flush=True)
        assert offset==Count(target)
    Check(all(r['passed']for r in certificates),'All actual saved-source correspondence and bounds');Check(not any(o.name.startswith('Temporary_')for o in scene.objects),'No bake staging in final source')
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [asset,*asset.children_recursive]:obj.select_set(True)
    export=root/'Exports/Model_Type94TanketteGameSourceReexportV100.glb';exporter.ExportGltf(export)
from io_scene_gltf2.io.com.constants import ROUNDING_DIGIT
report=dict(passed=all(r['passed']for r in checks),checks=checks,sourceBlendSha256=low['sourceBlendSha256'],highBlendSha256=high['sourceBlendSha256'],highSha256=high['sha256'],sha256=low['sha256'],certificates=certificates,maximumLocalBoundM=max(r['maximumLocalBoundM']for r in certificates),sourceReexportSha256=hashlib.sha256(export.read_bytes()).hexdigest(),exporterTangentRoundingDigits=ROUNDING_DIGIT,scope='Actual saved high/low arrays and part pairs. Raw export binding and physical motion are separate required checks.')
(acc/'Data_GameSourceReopenV100.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(passed=report['passed'],checks=len(checks),certificateRows=len(certificates),maximumLocalBoundM=report['maximumLocalBoundM'])),flush=True);assert report['passed']
