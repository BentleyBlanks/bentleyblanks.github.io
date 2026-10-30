"""Independent actual geometry/UV/rig/tangent/pixel proof for the V96 PBR."""
import ast,hashlib,importlib.util,io,json,os,struct
from pathlib import Path
import numpy as np
from PIL import Image
repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=Path(os.environ.get('TYPE94_PBR_ROOT',str(base/'SurfaceV96')));checks=[]
def Check(value,label):checks.append(dict(passed=bool(value),check=label))
p=json.loads((root/'Acceptance/Data_TowPbrPrepareV96.json').read_text());native=json.loads((root/'Acceptance/Data_TowSourceReopenV96.json').read_text())
file=Path(__file__).with_name('Script_VerifyType94WearV77.py');syntax=ast.parse(file.read_text())
exec(compile(ast.Module(body=[n for n in syntax.body if isinstance(n,ast.FunctionDef)and n.name in ['Read','Arrays']],type_ignores=[]),str(file),'exec'),globals())
spec=importlib.util.spec_from_file_location('Tow96Geometry',Path(__file__).with_name('Script_VerifyType94GeometryReplay.py'));proof=importlib.util.module_from_spec(spec);spec.loader.exec_module(proof)
geometry=Read(p['geometryReference']['sourceGlb']);before=Read(p['materialReference']['sourceGlb']);candidate=Read(root/'Exports/Model_Type94TanketteHighSurfaceV96Preview.glb');reexport=Read(root/'Exports/Model_Type94TanketteHighSurfaceV96SourceReexport.glb')
def Compare(a,b,attrs):
    x,fx=Arrays(a,attrs);y,fy=Arrays(b,attrs);_,ids=np.unique(np.vstack((x,y)),axis=0,return_inverse=True);i,j=ids[:len(x)],ids[len(x):]
    exact=np.array_equal(np.unique(i),np.unique(j))and np.array_equal(proof.CanonicalFaces(fx,i),proof.CanonicalFaces(fy,j))
    return exact,(fx,fy,i,j)
Check(candidate['nodes']==geometry['nodes']and len(candidate['nodes'])==295,'All295V95node poses/parents/properties exact')
Check(candidate['meshes'].keys()==geometry['meshes'].keys()and len(candidate['meshes'])==239,'All239V95mesh owners exact')
for name,parts in geometry['meshes'].items():Check(Compare(parts,candidate['meshes'][name],['POSITION','NORMAL'])[0],'Exact V95 oriented geometry/normals: '+name)
for name,parts in before['meshes'].items():
    if name in ['Geometry_Hull_Paint','Geometry_TowShackleFront_Paint']:continue
    attrs=sorted(k for k in parts[0]['attributes']if k!='TANGENT');Check(Compare(parts,candidate['meshes'][name],attrs)[0],'Exact retained V92 geometry/normal/UV: '+name)
attrs=['POSITION','NORMAL','TEXCOORD_0'];a,fa=Arrays(before['meshes']['Geometry_Hull_Paint'],attrs);b,fb=Arrays(candidate['meshes']['Geometry_Hull_Paint'],attrs)
_,ids=np.unique(np.vstack((a,b)),axis=0,return_inverse=True);i,j=ids[:len(a)],ids[len(a):];old={tuple(f)for f in proof.CanonicalFaces(fa,i)};new=proof.CanonicalFaces(fb,j)
Check(all(tuple(f)in old for f in new),'All retained Hull position/normal/UV triangles preserve V92 finish')
quantum=10.**(-native['exporterTangentRoundingDigits']);Check(quantum<=.0001,'Actual exporter tangent precision at least four decimal places');tangentStats=[]
def Tangents(parts,faces,codes):
    f=codes[faces];rotation=(np.argmin(f,axis=1)[:,None]+[0,1,2])%3;f=np.take_along_axis(f,rotation,axis=1)
    values=np.vstack([p['attributes']['TANGENT']for p in parts])[faces];values=np.take_along_axis(values,rotation[:,:,None],axis=1)
    return values[np.lexsort((f[:,2],f[:,1],f[:,0]))].astype(np.float64)
for name,parts in candidate['meshes'].items():
    target=reexport['meshes'][name];mapped=any(p['normalMapped']for p in parts);attrs=sorted(k for k in parts[0]['attributes']if not mapped or k!='TANGENT');exact,(fa,fb,i,j)=Compare(parts,target,attrs)
    Check(exact,'Exact reopened source oriented attributes: '+name)
    if mapped and 'TANGENT'in parts[0]['attributes']:
        x,y=Tangents(parts,fa,i),Tangents(target,fb,j);delta=abs(x[:,:,:3]-y[:,:,:3]);lx=np.linalg.norm(x[:,:,:3],axis=2);ly=np.linalg.norm(y[:,:,:3],axis=2);gate=float(quantum+np.finfo(np.float32).eps)
        Check(delta.max()<=gate and np.array_equal(x[:,:,3],y[:,:,3])and max(abs(lx-1).max(),abs(ly-1).max())<=np.sqrt(3)*gate,name+' tangent directions within actual exporter precision; handedness exact')
        tangentStats.append(dict(name=name,changedCorners=int(np.count_nonzero(np.any(delta>0,axis=2))),maxComponentDifference=float(delta.max()),componentGate=gate))
Check(candidate['nodes']==reexport['nodes'],'Reopened source rigid nodes exact')
x,y,w,h=p['patchPixels'];outside=np.ones((4096,4096),dtype=bool);outside[y:y+h,x:x+w]=False;folder=root/'Textures/HighSurfaceV96Preview'
for key,pixels in candidate['maps'].items():
    if key=='PaintBase':file=folder/'Texture_Type94PaintBasePatchedV96.png'
    elif key=='PaintNormal':file=folder/'Texture_Type94PaintNormalPatchedV96.png'
    elif key=='PaintOrm':file=folder/'Texture_Type94PaintOrmCurrentV96.png'
    else:file=Path(p['inputs'][key]['file'])
    Check(np.array_equal(pixels,np.asarray(Image.open(file).convert('RGB'))),key+' actual runtime equals master pixels')
    Check(np.array_equal(pixels,reexport['maps'][key]),key+' source-reexport pixels exact')
    if not key.startswith('Paint'):Check(np.array_equal(pixels,before['maps'][key]),key+' exact retained V92 pixels')
Check(np.array_equal(candidate['maps']['PaintBase'][outside],before['maps']['PaintBase'][outside]),'Paint Base exact outside new tile')
Check(np.array_equal(candidate['maps']['PaintNormal'][outside],before['maps']['PaintNormal'][outside]),'Paint Normal exact outside new tile')
Check(np.array_equal(candidate['maps']['PaintOrm'][outside,1:],before['maps']['PaintOrm'][outside,1:]),'Paint roughness/metallic exact outside new tile')
ao=np.asarray(Image.open(folder/'Texture_Type94PaintAoCurrentV96.png').convert('RGB'))
Check(np.array_equal(candidate['maps']['PaintOrm'][:,:,0],ao[:,:,0]),'Runtime Paint ORM R equals the current geometry AO bake')
Check(not np.array_equal(candidate['maps']['PaintOrm'][:,:,0],before['maps']['PaintOrm'][:,:,0]),'Geometry AO actually refreshed')
triangles=sum(len(p['indices'])//3 for rows in candidate['meshes'].values()for p in rows);Check(triangles==694288,'Exact V95triangle count')
report=dict(passed=all(r['passed']for r in checks),checks=checks,sha256=candidate['sha256'],sourceReexportSha256=reexport['sha256'],sourceReexportContainerExact=candidate['sha256']==reexport['sha256'],triangles=triangles,retainedOtherMeshOwners=236,retainedHullUvTriangles=len(new),tangentSourceReexport=tangentStats,patchPixels=p['patchPixels'],wholeReferenceAccepted=False,scope='Actual binary geometry/UV/rig/tangent and decoded image parity. Original V92 finish preserved outside empty new-detail tile, apart from current-geometry AO.')
(root/'Acceptance/Data_TowPbrVerificationV96.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(passed=report['passed'],checks=len(checks),failed=[r for r in checks if not r['passed']])));assert report['passed']
