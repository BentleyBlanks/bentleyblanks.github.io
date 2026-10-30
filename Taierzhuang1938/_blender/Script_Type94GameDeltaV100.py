"""Current/old game provenance from actual exporter-triangulated sources."""
import ast,bpy,hashlib,importlib.util,json,math,os,numpy as np
from pathlib import Path
repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=Path(os.environ.get('TYPE94_GAME_ROOT',str(base/'GameTrialV100')));(root/'Acceptance').mkdir(parents=True,exist_ok=True)
assert not bpy.data.filepath
spec=importlib.util.spec_from_file_location('Game100Export',repo/'Taierzhuang1938/_blender/Script_Type94Export.py');exporter=importlib.util.module_from_spec(spec);spec.loader.exec_module(exporter)
scope=dict(bpy=bpy,np=np,math=math,hashlib=hashlib)
for name,functions in [('Script_Type94GameTrial.py',['Count','LooseParts']),('Script_Type94GameDeltaV70.py',['Signature'])]:
    path=repo/'Taierzhuang1938/_blender'/name;syntax=ast.parse(path.read_text());exec(compile(ast.Module(body=[n for n in syntax.body if isinstance(n,ast.FunctionDef)and n.name in functions],type_ignores=[]),str(path),'exec'),scope)
def Snapshot(file):
    m=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette'/file).read_text());assert hashlib.sha256(Path(m['sourceBlend']).read_bytes()).hexdigest()==m['sourceBlendSha256'];bpy.ops.wm.open_mainfile(filepath=m['sourceBlend']);asset=bpy.data.objects['Type94Tankette'];groups={};rows={}
    for obj in sorted(asset.children_recursive,key=lambda o:o.name):
        if obj.type!='MESH':continue
        pointer=obj.data.as_pointer()
        if pointer not in groups:
            mesh=exporter.TriangulatedCopy(obj.data);parts=scope['LooseParts'](mesh);groups[pointer]=dict(signature=scope['Signature'](mesh),triangles=scope['Count'](mesh),parts=[dict(signature=scope['Signature'](mesh,ids),triangles=len(ids))for ids in parts]);bpy.data.meshes.remove(mesh)
        rows[obj.name]=groups[pointer]
    return dict(manifest=file,sha256=m['sha256'],sourceBlendSha256=m['sourceBlendSha256'],meshes=rows)
old=Snapshot('Data_SurfaceStudyV68.json');low=Snapshot('Data_GameTrialV70.json');current=Snapshot('Data_GrayTrialV98.json')
changed=[dict(name=name,highTriangles=row['triangles'],priorHighTriangles=old['meshes'].get(name,{}).get('triangles'),priorLowTriangles=low['meshes'].get(name,{}).get('triangles'),parts=len(row['parts']))for name,row in current['meshes'].items()if name not in old['meshes']or row['signature']!=old['meshes'][name]['signature']]
report=dict(old=old,low=low,current=current,changed=changed,removedOwners=sorted(old['meshes'].keys()-current['meshes'].keys()),wholeReferenceAccepted=False,scope='Actual local oriented float32 position/triangle signatures only; certificate reuse additionally requires exact paired low signature and valid prior bounds')
(root/'Acceptance/Data_GameDeltaV100.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(changed=changed,removed=report['removedOwners'],unchangedOwners=len(current['meshes'])-len(changed)),indent=2),flush=True)
