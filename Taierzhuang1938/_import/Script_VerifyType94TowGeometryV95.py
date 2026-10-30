"""Exact binary conservation outside the V95 towing hardware."""
import ast,hashlib,importlib.util,io,json,struct
from pathlib import Path
import numpy as np
from PIL import Image
repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=base/'TowShoulderV95';checks=[]
def Check(value,label):checks.append(dict(passed=bool(value),check=label))
m=json.loads((root/'Acceptance/Data_TowShoulderIdentityV95.json').read_text())
path=Path(__file__).with_name('Script_VerifyType94WearV77.py');syntax=ast.parse(path.read_text())
exec(compile(ast.Module(body=[n for n in syntax.body if isinstance(n,ast.FunctionDef)and n.name in ['Read','Arrays']],type_ignores=[]),str(path),'exec'),globals())
spec=importlib.util.spec_from_file_location('Tow95Geometry',Path(__file__).with_name('Script_VerifyType94GeometryReplay.py'));proof=importlib.util.module_from_spec(spec);spec.loader.exec_module(proof)
before=Read(m['sourceReference']['sourceGlb']);candidate=Read(m['sourceGlb']);reexport=Read(root/'Exports/Model_Type94TanketteHighShapeV95SourceReexport.glb');changed=set(m['changedMeshes'])
def Compare(a,b):
    attrs=sorted(a[0]['attributes']);x,fx=Arrays(a,attrs);y,fy=Arrays(b,attrs);_,ids=np.unique(np.vstack((x,y)),axis=0,return_inverse=True);i,j=ids[:len(x)],ids[len(x):]
    return np.array_equal(np.unique(i),np.unique(j))and np.array_equal(proof.CanonicalFaces(fx,i),proof.CanonicalFaces(fy,j))
Check(candidate['nodes'].keys()==before['nodes'].keys()and len(candidate['nodes'])==295,'All295nodes preserved')
for name,node in candidate['nodes'].items():
    if name in changed:Check(node['parent']==before['nodes'][name]['parent']and node['pose']==before['nodes'][name]['pose'],'Changed mesh retains pose/parent: '+name)
    else:Check(node==before['nodes'][name],'Retained pose/parent/properties exact: '+name)
Check(len(candidate['meshes'])==239,'All239mesh owners present')
for name,parts in before['meshes'].items():
    if name not in changed:Check(Compare(parts,candidate['meshes'][name]),'Unchanged oriented attributes exact: '+name)
for name,parts in candidate['meshes'].items():Check(Compare(parts,reexport['meshes'][name]),'Saved source oriented attributes exact: '+name)
Check(candidate['nodes']==reexport['nodes'],'Saved source rigid nodes exact')
oldWorld=proof.ReadGeometry(Path(m['sourceReference']['sourceGlb']));newWorld=proof.ReadGeometry(Path(m['sourceGlb']));a=np.vstack([r['points']for r in oldWorld['meshes'].values()]);b=np.vstack([r['points']for r in newWorld['meshes'].values()])
Check(np.array_equal(a.min(axis=0),b.min(axis=0))and np.array_equal(a.max(axis=0),b.max(axis=0)),'Whole vehicle metric bounds exact')
triangles=sum(len(p['indices'])//3 for rows in candidate['meshes'].values()for p in rows)
report=dict(passed=all(r['passed']for r in checks),checks=checks,sha256=candidate['sha256'],sourceReexportSha256=reexport['sha256'],sourceReexportContainerExact=candidate['sha256']==reexport['sha256'],triangles=triangles,unchangedMeshOwners=237,preservedPoseNodes=295,dimensionsWidthHeightLengthM=(b.max(axis=0)-b.min(axis=0)).tolist(),wholeReferenceAccepted=False)
(root/'Acceptance/Data_TowGeometryV95.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(passed=report['passed'],checks=len(checks),triangles=triangles,failed=[r for r in checks if not r['passed']])));assert report['passed']
