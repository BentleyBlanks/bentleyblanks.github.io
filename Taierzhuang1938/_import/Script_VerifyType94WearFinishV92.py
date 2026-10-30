"""Independent actual-accessor and decoded-image audit for the V92 finish."""
import ast,hashlib,importlib.util,io,json,os,struct
from pathlib import Path
import numpy as np
from PIL import Image

repo=Path(__file__).resolve().parents[2]
root=Path(os.environ.get('TYPE94_FINISH_ROOT',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette/SurfaceV92'))
checks=[]
def Check(passed,check):checks.append(dict(passed=bool(passed),check=check))
path=Path(__file__).with_name('Script_VerifyType94WearV77.py');syntax=ast.parse(path.read_text())
exec(compile(ast.Module(body=[n for n in syntax.body if isinstance(n,ast.FunctionDef)and n.name in ['Read','Arrays']],type_ignores=[]),str(path),'exec'),globals())
spec=importlib.util.spec_from_file_location('Finish92Geometry',Path(__file__).with_name('Script_VerifyType94GeometryReplay.py'));proof=importlib.util.module_from_spec(spec);spec.loader.exec_module(proof)
preparation=json.loads((root/'Acceptance/Data_FinishPreparationV92.json').read_text())
native=json.loads((root/'Acceptance/Data_FinishSourceReopenV92.json').read_text())
bake=json.loads((root/'Acceptance/Data_FinishRasterV92.json').read_text())
reference=Read(preparation['reference']['sourceGlb'])
candidate=Read(root/'Exports/Model_Type94TanketteHighSurfaceV92Preview.glb')
reexport=Read(root/'Exports/Model_Type94TanketteHighSurfaceV92SourceReexport.glb')
quantum=10.**(-native['exporterTangentRoundingDigits']);Check(quantum<=.0001,'Actual exporter tangent precision at least four decimal places')
tangentRows=[]

def Tangents(parts,faces,ids):
    codes=ids[faces];rotation=(np.argmin(codes,axis=1)[:,None]+[0,1,2])%3
    codes=np.take_along_axis(codes,rotation,axis=1)
    tangents=np.vstack([p['attributes']['TANGENT']for p in parts])[faces]
    tangents=np.take_along_axis(tangents,rotation[:,:,None],axis=1)
    return tangents[np.lexsort((codes[:,2],codes[:,1],codes[:,0]))].astype(np.float64)

for label,target in [('V91GeometryUvRig',reference),('SavedSourceReexport',reexport)]:
    Check(candidate['nodes']==target['nodes']and len(candidate['nodes'])==293,label+' all293poses/parents/properties exact')
    Check(candidate['meshes'].keys()==target['meshes'].keys()and len(candidate['meshes'])==238,label+' all238mesh owners exact')
    for name,parts in candidate['meshes'].items():
        other=target['meshes'][name];mapped=any(p['normalMapped']for p in parts)
        attributes=sorted(k for k in parts[0]['attributes']if not mapped or k!='TANGENT')
        a,fa=Arrays(parts,attributes);b,fb=Arrays(other,attributes)
        _,ids=np.unique(np.vstack((a,b)),axis=0,return_inverse=True);i,j=ids[:len(a)],ids[len(a):]
        exact=np.array_equal(np.unique(i),np.unique(j))and np.array_equal(proof.CanonicalFaces(fa,i),proof.CanonicalFaces(fb,j))
        Check(exact,label+' exact oriented geometry/normals/UV: '+name)
        Check([p['material']for p in parts]==[p['material']for p in other],label+' same material bindings: '+name)
        if mapped and 'TANGENT'in parts[0]['attributes']:
            x,y=Tangents(parts,fa,i),Tangents(other,fb,j);delta=abs(x[:,:,:3]-y[:,:,:3])
            lx,ly=np.linalg.norm(x[:,:,:3],axis=2),np.linalg.norm(y[:,:,:3],axis=2);gate=float(quantum+np.finfo(np.float32).eps)
            Check(delta.max()<=gate and np.array_equal(x[:,:,3],y[:,:,3])and max(abs(lx-1).max(),abs(ly-1).max())<=np.sqrt(3)*gate,label+' tangent precision/handedness: '+name)
            tangentRows.append(dict(comparison=label,owner=name,maxComponentDifference=float(delta.max()),changedCorners=int(np.count_nonzero(np.any(delta>0,axis=2))),componentGate=gate))
for key,pixels in candidate['maps'].items():
    Check(np.array_equal(pixels,reexport['maps'][key]),key+' saved-source runtime pixels exact')
    if key.startswith('Paint'):
        expected=np.asarray(Image.open(bake['outputs'][key.removeprefix('Paint')]['file']).convert('RGB'))
        Check(np.array_equal(pixels,expected),key+' actual runtime equals generated master')
    else:Check(np.array_equal(pixels,reference['maps'][key]),key+' exact unchanged material family')
Check(np.array_equal(candidate['maps']['PaintOrm'][:,:,0],reference['maps']['PaintOrm'][:,:,0]),'All current-geometry Paint AO pixels exact')
core=np.asarray(Image.open(bake['masks']['Core']).convert('L'))/255
scuff=np.asarray(Image.open(bake['masks']['Scuff']).convert('L'))
scratch=np.asarray(Image.open(bake['masks']['Scratch']).convert('L'))
loss=np.asarray(Image.open(bake['masks']['Loss']).convert('L'))
outside=(loss==0)&(scuff==0)&(scratch==0)
for key in ['PaintBase','PaintOrm','PaintNormal']:Check(np.array_equal(candidate['maps'][key][outside],reference['maps'][key][outside]),key+' untouched texels exact')
exposed=core>.97
Check(exposed.sum()>1000,'Exposed steel has nontrivial actual texture coverage')
orm=candidate['maps']['PaintOrm']
Check(np.min(orm[:,:,2][exposed])>=242,'Exposed steel is conducting rather than a pale paint mark')
Check(np.max(orm[:,:,1][exposed])<=85,'Exposed steel has independently smoother roughness')
oldSlope=np.linalg.norm(reference['maps']['PaintNormal'][:,:,:2].astype(float)-127.5,axis=2)
newSlope=np.linalg.norm(candidate['maps']['PaintNormal'][:,:,:2].astype(float)-127.5,axis=2)
Check(np.mean(newSlope[exposed])<np.mean(oldSlope[exposed]),'Exposed substrate actually loses rough coating normal')
triangles=sum(len(p['indices'])//3 for rows in candidate['meshes'].values()for p in rows);Check(triangles==622112,'622112triangles unchanged')
report=dict(passed=all(r['passed']for r in checks),checks=checks,sha256=candidate['sha256'],sourceReexportSha256=reexport['sha256'],sourceReexportContainerExact=candidate['sha256']==reexport['sha256'],tangentPrecision=tangentRows,triangles=triangles,fullyExposedSteelPixels=int(exposed.sum()),meanExposedSlopeBefore=float(oldSlope[exposed].mean()),meanExposedSlopeAfter=float(newSlope[exposed].mean()),wholeReferenceAccepted=False,scope='Actual source/runtime geometry, UV, rig, binding and decoded PBR pixels; wear amount and historical damage placement remain art direction.')
(root/'Acceptance/Data_FinishVerificationV92.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(dict(passed=report['passed'],checks=len(checks),failed=[r for r in checks if not r['passed']])))
assert report['passed']
