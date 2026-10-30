"""Independent geometry, rigid pose, retained UV and actual image-pixel audit."""
import ast,hashlib,importlib.util,io,json,os,struct
from pathlib import Path
import numpy as np
from PIL import Image

repo=Path(__file__).resolve().parents[2]
root=Path(os.environ.get('TYPE94_PATCH_ROOT',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette/SurfaceV91'))
prepare=json.loads((root/'Acceptance/Data_PbrPatchPrepareV91.json').read_text())
checks=[]


def Check(value,label):
    checks.append(dict(passed=bool(value),check=label))


# Read the actual accessors and image bindings with the existing independent
# binary parser; no producer geometry/UV arrays are used as a substitute.
path=Path(__file__).with_name('Script_VerifyType94WearV77.py')
syntax=ast.parse(path.read_text())
exec(compile(ast.Module(body=[n for n in syntax.body if isinstance(n,ast.FunctionDef)and n.name in ['Read','Arrays']],type_ignores=[]),str(path),'exec'),globals())
spec=importlib.util.spec_from_file_location('Patch91Surface',Path(__file__).with_name('Script_VerifyType94GeometryReplay.py'))
proof=importlib.util.module_from_spec(spec);spec.loader.exec_module(proof)
geometry=Read(prepare['geometryReference']['sourceGlb'])
before=Read(prepare['materialReference']['sourceGlb'])
candidate=Read(root/'Exports/Model_Type94TanketteHighSurfaceV91Preview.glb')
reexport=Read(root/'Exports/Model_Type94TanketteHighSurfaceV91SourceReexport.glb')
native=json.loads((root/'Acceptance/Data_SourceReopenV91.json').read_text())
quantum=10.**(-native['exporterTangentRoundingDigits'])
Check(quantum<=.0001,'Actual exporter retains at least four tangent decimal places')
tangentStats=[]


def Faces(parts,attributes):
    return Arrays(parts,attributes)


def Compare(x,y,attributes):
    a,fa=Faces(x,attributes);b,fb=Faces(y,attributes)
    _,ids=np.unique(np.vstack((a,b)),axis=0,return_inverse=True)
    i,j=ids[:len(a)],ids[len(a):]
    return np.array_equal(np.unique(i),np.unique(j))and np.array_equal(proof.CanonicalFaces(fa,i),proof.CanonicalFaces(fb,j))


Check(candidate['meshes'].keys()==geometry['meshes'].keys() and len(candidate['meshes'])==238,'Same238V89mesh owners')
Check(candidate['nodes']==geometry['nodes'] and len(candidate['nodes'])==293,'All293V89poses/parents/properties exact')
for name,parts in geometry['meshes'].items():
    Check(Compare(parts,candidate['meshes'][name],['POSITION','NORMAL']),'V89oriented geometry/normal surface exact: '+name)
for name,parts in candidate['meshes'].items():
    normalMapped=any(p['normalMapped']for p in parts)
    attributes=sorted(k for k in parts[0]['attributes']if not normalMapped or k!='TANGENT')
    Check(Compare(parts,reexport['meshes'][name],attributes),'Reopened source geometry/normal/UV surface exact: '+name)
    if not normalMapped or 'TANGENT' not in parts[0]['attributes']:continue
    target=reexport['meshes'][name]
    a,fa=Faces(parts,attributes);b,fb=Faces(target,attributes)
    _,ids=np.unique(np.vstack((a,b)),axis=0,return_inverse=True);i,j=ids[:len(a)],ids[len(a):]
    def Tangents(rows,faces,codes):
        f=codes[faces];rotation=(np.argmin(f,axis=1)[:,None]+[0,1,2])%3;f=np.take_along_axis(f,rotation,axis=1)
        values=np.vstack([p['attributes']['TANGENT']for p in rows])[faces]
        values=np.take_along_axis(values,rotation[:,:,None],axis=1)
        return values[np.lexsort((f[:,2],f[:,1],f[:,0]))].astype(np.float64)
    x,y=Tangents(parts,fa,i),Tangents(target,fb,j)
    delta=abs(x[:,:,:3]-y[:,:,:3]);lx=np.linalg.norm(x[:,:,:3],axis=2);ly=np.linalg.norm(y[:,:,:3],axis=2)
    gate=float(quantum+np.finfo(np.float32).eps)
    angle=float(np.degrees(np.arccos(np.clip(np.sum(x[:,:,:3]*y[:,:,:3],axis=2)/np.maximum(lx*ly,1e-15),-1,1))).max())
    Check(delta.max()<=gate and np.array_equal(x[:,:,3],y[:,:,3])and max(abs(lx-1).max(),abs(ly-1).max())<=np.sqrt(3)*gate,name+' tangent directions within actual exporter precision and handedness exact')
    tangentStats.append(dict(name=name,changedCorners=int(np.count_nonzero(np.any(delta>0,axis=2))),maxComponentDifference=float(delta.max()),maximumAngleDegrees=angle,componentGate=gate))
Check(candidate['nodes']==reexport['nodes'],'Reopened source rigid nodes exact')
changed={'Geometry_Hull_Paint','Geometry_NoseHousing_Paint','Geometry_FrontCornerEarRight_Paint'}
for name,parts in before['meshes'].items():
    if name not in changed:
        attributes=sorted(k for k in parts[0]['attributes']if k!='TANGENT')
        Check(Compare(parts,candidate['meshes'][name],attributes),'Retained geometry/normal/UV exact: '+name)

# The retained hull triangles must be a literal subset of the original
# position/normal/UV corner soup; new head triangles are confined to the patch.
x,y,w,h=prepare['patchPixels'];u0,u1=x/4096,(x+w)/4096;v0,v1=1-(y+h)/4096,1-y/4096
oldSites,oldFaces=Faces(before['meshes']['Geometry_Hull_Paint'],['POSITION','NORMAL','TEXCOORD_0'])
newSites,newFaces=Faces(candidate['meshes']['Geometry_Hull_Paint'],['POSITION','NORMAL','TEXCOORD_0'])
# glTF stores V inverted relative to Blender UV.
uv=newSites[:,-2:];inside=(uv[:,0]>=u0-1e-7)&(uv[:,0]<=u1+1e-7)&(uv[:,1]>=1-v1-1e-7)&(uv[:,1]<=1-v0+1e-7)
newPatch=np.all(inside[newFaces],axis=1)
Check(np.count_nonzero(newPatch)==384,'Exactly384new front-head triangles use the new patch')
_,ids=np.unique(np.vstack((oldSites,newSites)),axis=0,return_inverse=True)
a,b=ids[:len(oldSites)],ids[len(oldSites):]
oldCodes=proof.CanonicalFaces(oldFaces,a);retained=proof.CanonicalFaces(newFaces[~newPatch],b)
oldSet={tuple(face)for face in oldCodes}
Check(all(tuple(face)in oldSet for face in retained),'All retained Hull position/normal/UV triangles preserve old sampled finish')

folder=root/'Textures/HighSurfaceV91Preview'
outside=np.ones((4096,4096),dtype=bool);outside[y:y+h,x:x+w]=False
for key,pixels in candidate['maps'].items():
    if key=='PaintBase':file=folder/'Texture_Type94PaintBasePatchedV91.png'
    elif key=='PaintNormal':file=folder/'Texture_Type94PaintNormalPatchedV91.png'
    elif key=='PaintOrm':file=folder/'Texture_Type94PaintOrmCurrentV91.png'
    else:file=Path(prepare['inputs'][key]['file'])
    expected=np.asarray(Image.open(file).convert('RGB'))
    Check(np.array_equal(pixels,expected),key+'actual runtime pixels equal retained master')
    Check(np.array_equal(pixels,reexport['maps'][key]),key+'saved-source reexport pixels exact')
    if not key.startswith('Paint'):
        Check(np.array_equal(pixels,before['maps'][key]),key+'unchanged fromV77')
Check(np.array_equal(candidate['maps']['PaintBase'][outside],before['maps']['PaintBase'][outside]),'Retained Paint Base pixels exact outside patch')
Check(np.array_equal(candidate['maps']['PaintNormal'][outside],before['maps']['PaintNormal'][outside]),'Retained Paint Normal pixels exact outside patch')
Check(np.array_equal(candidate['maps']['PaintOrm'][outside,1:],before['maps']['PaintOrm'][outside,1:]),'Retained Paint roughness/metalness pixels exact outside patch')
aoPixels=np.asarray(Image.open(folder/'Texture_Type94PaintCurrentAoV91.png').convert('RGB'))
Check(np.array_equal(candidate['maps']['PaintOrm'][:,:,0],aoPixels[:,:,0]),'Actual ORM R equals current-geometry AO bake')
Check(not np.array_equal(candidate['maps']['PaintOrm'][:,:,0],before['maps']['PaintOrm'][:,:,0]),'Current-geometry AO actually replaces the old contact shadows')
triangles=sum(len(p['indices'])//3 for rows in candidate['meshes'].values()for p in rows)
Check(triangles==622112,'Exact current high triangle count')
report=dict(passed=all(c['passed']for c in checks),checks=checks,sha256=candidate['sha256'],triangles=triangles,
    sourceReexportSha256=reexport['sha256'],sourceReexportContainerExact=candidate['sha256']==reexport['sha256'],
    tangentSourceReexport=tangentStats,exporterTangentRoundingDigits=native['exporterTangentRoundingDigits'],
    retainedBodyMeshOwners=235,retainedHullSampledUvTriangles=len(retained),newHullPatchTriangles=int(newPatch.sum()),
    currentAoExplicitlyRefreshed=True,wholeReferenceAccepted=False,
    scope='Actual binary geometry/pose/UV/image bindings. Only new detail UVs and the current Paint AO refresh are allowed; no whole-reference acceptance.')
(root/'Acceptance/Data_PbrPatchVerificationV91.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(dict(passed=report['passed'],checks=len(checks),failed=[r for r in checks if not r['passed']])))
assert report['passed']
