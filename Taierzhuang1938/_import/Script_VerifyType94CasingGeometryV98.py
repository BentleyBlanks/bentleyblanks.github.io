"""Exact conservation of retained oriented surfaces and every rigid node."""
import ast,hashlib,importlib.util,io,json,struct
from pathlib import Path
import numpy as np
from PIL import Image
repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=base/'CasingLugV98';m=json.loads((root/'Acceptance/Data_CasingLugIdentityV98.json').read_text());checks=[]
def Check(passed,label):checks.append(dict(passed=bool(passed),check=label))
file=Path(__file__).with_name('Script_VerifyType94WearV77.py');syntax=ast.parse(file.read_text());exec(compile(ast.Module(body=[n for n in syntax.body if isinstance(n,ast.FunctionDef)and n.name in ['Read','Arrays']],type_ignores=[]),str(file),'exec'),globals())
spec=importlib.util.spec_from_file_location('Casing98Geometry',Path(__file__).with_name('Script_VerifyType94GeometryReplay.py'));proof=importlib.util.module_from_spec(spec);spec.loader.exec_module(proof)
before=Read(m['reference']['sourceGlb']);candidate=Read(m['sourceGlb']);reexport=Read(root/'Exports/Model_Type94TanketteHighShapeV98SourceReexport.glb')
def Compare(a,b):
    attrs=sorted(a[0]['attributes']);x,fx=Arrays(a,attrs);y,fy=Arrays(b,attrs);_,ids=np.unique(np.vstack((x,y)),axis=0,return_inverse=True);i,j=ids[:len(x)],ids[len(x):]
    return np.array_equal(np.unique(i),np.unique(j))and np.array_equal(proof.CanonicalFaces(fx,i),proof.CanonicalFaces(fy,j))
Check({k:v for k,v in candidate['nodes'].items()if k!=m['newMesh']}==before['nodes']and len(candidate['nodes'])==296,'All295original poses/parents/properties exact; one fixed child added')
Check(candidate['meshes'].keys()==before['meshes'].keys()|{m['newMesh']}and len(candidate['meshes'])==240,'All239original mesh owners retained with one new mesh')
for name,parts in before['meshes'].items():
    Check(Compare(parts,candidate['meshes'][name]),'Unchanged oriented attributes exact: '+name)
for name,parts in candidate['meshes'].items():Check(Compare(parts,reexport['meshes'][name]),'Saved-source surface exact: '+name)
added=sum(len(p['indices'])//3 for p in candidate['meshes'][m['newMesh']]);Check(added==188,'Exactly188added lug triangles')
aw=proof.ReadGeometry(Path(m['reference']['sourceGlb']));bw=proof.ReadGeometry(Path(m['sourceGlb']));pa=np.vstack([v['points']for v in aw['meshes'].values()]);pb=np.vstack([v['points']for v in bw['meshes'].values()]);Check(np.array_equal(pa.min(axis=0),pb.min(axis=0))and np.array_equal(pa.max(axis=0),pb.max(axis=0)),'Whole vehicle metric bounds exact')
Check(candidate['nodes']==reexport['nodes'],'Saved-source rigid nodes exact');triangles=sum(len(p['indices'])//3 for rows in candidate['meshes'].values()for p in rows)
report=dict(passed=all(r['passed']for r in checks),checks=checks,sha256=candidate['sha256'],sourceReexportSha256=reexport['sha256'],sourceReexportContainerExact=candidate['sha256']==reexport['sha256'],triangles=triangles,unchangedOriginalMeshOwners=239,preservedOriginalPoseNodes=295,newMesh=m['newMesh'],addedTriangles=added,dimensionsWidthHeightLengthM=(pb.max(axis=0)-pb.min(axis=0)).tolist(),wholeReferenceAccepted=False)
(root/'Acceptance/Data_CasingGeometryV98.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(passed=report['passed'],checks=len(checks),failed=[r for r in checks if not r['passed']])));assert report['passed']
