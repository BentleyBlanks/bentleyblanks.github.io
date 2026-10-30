"""Actual GLB conservation audit for the front towing-hardware replacement."""
import ast,hashlib,importlib.util,io,json,struct
from pathlib import Path
import numpy as np
from PIL import Image
repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=base/'TowHookV94'
m=json.loads((root/'Acceptance/Data_TowHookIdentityV94.json').read_text());checks=[]
def Check(value,label):checks.append(dict(passed=bool(value),check=label))
path=Path(__file__).with_name('Script_VerifyType94WearV77.py');syntax=ast.parse(path.read_text())
exec(compile(ast.Module(body=[n for n in syntax.body if isinstance(n,ast.FunctionDef)and n.name in ['Read','Arrays']],type_ignores=[]),str(path),'exec'),globals())
spec=importlib.util.spec_from_file_location('Tow94Geometry',Path(__file__).with_name('Script_VerifyType94GeometryReplay.py'));proof=importlib.util.module_from_spec(spec);spec.loader.exec_module(proof)
before=Read(m['sourceReference']['sourceGlb']);candidate=Read(m['sourceGlb']);reexport=Read(root/'Exports/Model_Type94TanketteHighShapeV94SourceReexport.glb')
def Compare(a,b):
    attributes=sorted(a[0]['attributes']);x,fx=Arrays(a,attributes);y,fy=Arrays(b,attributes)
    _,ids=np.unique(np.vstack((x,y)),axis=0,return_inverse=True);i,j=ids[:len(x)],ids[len(x):]
    return np.array_equal(np.unique(i),np.unique(j))and np.array_equal(proof.CanonicalFaces(fx,i),proof.CanonicalFaces(fy,j))
oldExcluded={'TowShackleFront','Geometry_TowShackleFront_Paint'};newExcluded={'TowLatchFront','Geometry_TowLatchFront_Paint','TowHookFrontFixed','Geometry_TowHookFrontFixed_Paint'}
Check(len(candidate['nodes'])==295 and len(candidate['meshes'])==239,'295nodes and239mesh owners')
Check({k:v for k,v in before['nodes'].items()if k not in oldExcluded}=={k:v for k,v in candidate['nodes'].items()if k not in newExcluded},'All291retained poses/parents/properties exact')
Check(not oldExcluded.intersection(candidate['nodes']),'Incorrect shackle nodes actually removed')
for name,parts in before['meshes'].items():
    if name in ['Geometry_Hull_Paint','Geometry_TowShackleFront_Paint']:continue
    Check(Compare(parts,candidate['meshes'][name]),'Retained oriented position/normal/UV attributes exact: '+name)
for name,parts in candidate['meshes'].items():Check(Compare(parts,reexport['meshes'][name]),'Saved-source reexport surface exact: '+name)
Check(candidate['nodes']==reexport['nodes'],'Saved-source rigid nodes exact')
attributes=sorted(before['meshes']['Geometry_Hull_Paint'][0]['attributes'])
a,fa=Arrays(before['meshes']['Geometry_Hull_Paint'],attributes);b,fb=Arrays(candidate['meshes']['Geometry_Hull_Paint'],attributes)
_,ids=np.unique(np.vstack((a,b)),axis=0,return_inverse=True);i,j=ids[:len(a)],ids[len(a):]
oldFaces=proof.CanonicalFaces(fa,i);newFaces=proof.CanonicalFaces(fb,j);oldSet={tuple(f)for f in oldFaces};newSet={tuple(f)for f in newFaces}
Check(newSet.issubset(oldSet),'All retained Hull oriented corner attributes are an exact subset')
worldOld=proof.ReadGeometry(Path(m['sourceReference']['sourceGlb']));worldNew=proof.ReadGeometry(Path(m['sourceGlb']))
allOld=np.vstack([r['points']for r in worldOld['meshes'].values()]);allNew=np.vstack([r['points']for r in worldNew['meshes'].values()])
Check(np.array_equal(allOld.min(axis=0),allNew.min(axis=0))and np.array_equal(allOld.max(axis=0),allNew.max(axis=0)),'Whole-vehicle metric bounds exact')
triangles=sum(len(p['indices'])//3 for rows in candidate['meshes'].values()for p in rows)
Check(triangles>622112,'New hook/gate actually increases authored detail')
report=dict(passed=all(r['passed']for r in checks),checks=checks,sha256=candidate['sha256'],sourceReexportSha256=reexport['sha256'],sourceReexportContainerExact=candidate['sha256']==reexport['sha256'],triangles=triangles,unchangedMeshOwners=236,unchangedPoseNodes=291,retainedHullTriangles=len(newFaces),removedHullTriangles=len(oldFaces)-len(newFaces),dimensionsWidthHeightLengthM=(allNew.max(axis=0)-allNew.min(axis=0)).tolist(),wholeReferenceAccepted=False)
(root/'Acceptance/Data_TowGeometryV94.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(passed=report['passed'],checks=len(checks),triangles=triangles,failed=[r for r in checks if not r['passed']])));assert report['passed']
