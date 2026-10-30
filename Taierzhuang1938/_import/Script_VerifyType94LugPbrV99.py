"""Current high PBR is actual V98 geometry plus exact retained V96 finish."""
import ast,hashlib,importlib.util,io,json,os,struct
from pathlib import Path
import numpy as np
from PIL import Image
repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=Path(os.environ.get('TYPE94_HIGH_ROOT',str(base/'SurfaceV99')));checks=[]
def Check(value,label):checks.append(dict(passed=bool(value),check=label))
file=Path(__file__).with_name('Script_VerifyType94WearV77.py');syntax=ast.parse(file.read_text());exec(compile(ast.Module(body=[n for n in syntax.body if isinstance(n,ast.FunctionDef)and n.name in ['Read','Arrays']],type_ignores=[]),str(file),'exec'),globals())
spec=importlib.util.spec_from_file_location('High99Geometry',Path(__file__).with_name('Script_VerifyType94GeometryReplay.py'));proof=importlib.util.module_from_spec(spec);spec.loader.exec_module(proof)
p=json.loads((root/'Acceptance/Data_LugBakeV99.json').read_text());m=json.loads((root/'Acceptance/Data_CurrentPbrV99.json').read_text());before=Read(p['materialReference']['sourceGlb']);geometry=Read(p['geometryReference']['sourceGlb']);candidate=Read(m['sourceGlb']);reexport=Read(root/'Exports/Model_Type94TanketteHighSurfaceV99Reexport.glb')
def Compare(a,b,attrs):
    x,fx=Arrays(a,attrs);y,fy=Arrays(b,attrs);_,ids=np.unique(np.vstack((x,y)),axis=0,return_inverse=True);i,j=ids[:len(x)],ids[len(x):];return np.array_equal(np.unique(i),np.unique(j))and np.array_equal(proof.CanonicalFaces(fx,i),proof.CanonicalFaces(fy,j)),(fx,fy,i,j)
Check(candidate['nodes']==geometry['nodes']and len(candidate['nodes'])==296,'All296current rigid poses/parents/properties exact')
Check(candidate['meshes'].keys()==geometry['meshes'].keys()and len(candidate['meshes'])==240,'All240current mesh owners exact')
for name,parts in geometry['meshes'].items():Check(Compare(parts,candidate['meshes'][name],['POSITION','NORMAL'])[0],'Current V98oriented geometry/normals exact: '+name)
for name,parts in before['meshes'].items():Check(Compare(parts,candidate['meshes'][name],sorted(k for k in parts[0]['attributes']if k!='TANGENT'))[0],'Retained V96position/normal/UV exact: '+name)
quantum=10.**(-m['exporterTangentRoundingDigits']);Check(quantum<=.0001,'Exporter tangent component precision measured');stats=[]
def Tangents(rows,faces,codes):
    f=codes[faces];r=(np.argmin(f,axis=1)[:,None]+[0,1,2])%3;f=np.take_along_axis(f,r,axis=1);v=np.vstack([p['attributes']['TANGENT']for p in rows])[faces];v=np.take_along_axis(v,r[:,:,None],axis=1);return v[np.lexsort((f[:,2],f[:,1],f[:,0]))].astype(float)
for name,parts in candidate['meshes'].items():
    target=reexport['meshes'][name];mapped=any(p['normalMapped']for p in parts);exact,(fa,fb,i,j)=Compare(parts,target,sorted(k for k in parts[0]['attributes']if not mapped or k!='TANGENT'));Check(exact,'Reopened source oriented attributes exact: '+name)
    if mapped:
        a,b=Tangents(parts,fa,i),Tangents(target,fb,j);delta=abs(a[:,:,:3]-b[:,:,:3]);gate=quantum+np.finfo(np.float32).eps;Check(delta.max()<=gate and np.array_equal(a[:,:,3],b[:,:,3]),name+' tangent precision/handedness');stats.append(float(delta.max()))
Check(candidate['nodes']==reexport['nodes'],'Source reexport rigid hierarchy exact')
x,y,w,h=p['patchPixels'];outside=np.ones((4096,4096),dtype=bool);outside[y:y+h,x:x+w]=False
for key,pixels in candidate['maps'].items():
    Check(np.array_equal(pixels,reexport['maps'][key]),key+' reexport pixels exact')
    if key.startswith('Paint'):
        channel=key[5:];expected=np.asarray(Image.open(root/'Textures/HighSurfaceV99'/('Texture_Type94Paint'+channel+'PatchedV99.png')).convert('RGB'));Check(np.array_equal(pixels,expected),key+' actual pixels equal composite');Check(np.array_equal(pixels[outside],before['maps'][key][outside]),key+' old pixels exact outside new tile')
    else:Check(np.array_equal(pixels,before['maps'][key]),key+' exact original pixels')
report=dict(passed=all(r['passed']for r in checks),checks=checks,sha256=candidate['sha256'],sourceReexportSha256=reexport['sha256'],sourceReexportContainerExact=candidate['sha256']==reexport['sha256'],maximumTangentComponentDifference=max(stats),runtimeMaps=len(candidate['maps']),oldMeshOwnersPreserved=239,currentMeshOwners=240,currentPoseNodes=296,wholeReferenceAccepted=False)
(root/'Acceptance/Data_CurrentPbrVerificationV99.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(passed=report['passed'],checks=len(checks),failed=[r for r in checks if not r['passed']])));assert report['passed']
