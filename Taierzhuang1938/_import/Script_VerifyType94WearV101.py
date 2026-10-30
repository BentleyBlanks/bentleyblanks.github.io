"""Verify actual current GLB geometry, saved source and layered PBR outputs."""
import ast,hashlib,importlib.util,io,json,os,struct
from pathlib import Path
import numpy as np
from PIL import Image

repo=Path(__file__).resolve().parents[2];root=Path(os.environ.get('TYPE94_WEAR101_ROOT',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette/SurfaceV101'));checks=[]
def Check(value,label):checks.append(dict(passed=bool(value),check=label))
path=Path(__file__).with_name('Script_VerifyType94WearV77.py');syntax=ast.parse(path.read_text());exec(compile(ast.Module(body=[n for n in syntax.body if isinstance(n,ast.FunctionDef)and n.name in ['Read','Arrays']],type_ignores=[]),str(path),'exec'),globals())
spec=importlib.util.spec_from_file_location('Wear101Surface',Path(__file__).with_name('Script_VerifyType94GeometryReplay.py'));canonical=importlib.util.module_from_spec(spec);spec.loader.exec_module(canonical)
prep=json.loads((root/'Acceptance/Data_WearPreparationV101.json').read_text());native=json.loads((root/'Acceptance/Data_WearSourceReopenV101.json').read_text());raster=json.loads((root/'Acceptance/Data_WearRasterV101.json').read_text())
reference=Read(prep['reference']['sourceGlb']);candidate=Read(native['sourceGlb']);reexport=Read(root/'Exports/Model_Type94TanketteHighWearReexportV101.glb')
Check(reference['sha256']==prep['reference']['sha256'],'Immutable V99 actual input identity');Check(candidate['sha256']==native['sha256'],'Current actual export identity');Check(hashlib.sha256(Path(native['sourceBlend']).read_bytes()).hexdigest()==native['sourceBlendSha256'],'Reopened saved source identity')
quantum=10.**(-native['exporterTangentRoundingDigits']);tangentMax=0.
def Tangents(parts,faces,codes):
    f=codes[faces];r=(np.argmin(f,axis=1)[:,None]+[0,1,2])%3;f=np.take_along_axis(f,r,axis=1);v=np.vstack([p['attributes']['TANGENT']for p in parts])[faces];v=np.take_along_axis(v,r[:,:,None],axis=1);return v[np.lexsort((f[:,2],f[:,1],f[:,0]))].astype(float)
for label,target in [('V99',reference),('ReopenedSource',reexport)]:
    Check(candidate['nodes']==target['nodes']and len(candidate['nodes'])==296,label+' all296poses/parents/control properties exact');Check(candidate['meshes'].keys()==target['meshes'].keys()and len(candidate['meshes'])==240,label+' all240mesh owners exact')
    for name,parts in candidate['meshes'].items():
        other=target['meshes'][name];mapped=any(p['normalMapped']for p in parts);attrs=sorted(k for k in parts[0]['attributes']if not mapped or k!='TANGENT');a,fa=Arrays(parts,attrs);b,fb=Arrays(other,attrs);_,ids=np.unique(np.vstack((a,b)),axis=0,return_inverse=True);i,j=ids[:len(a)],ids[len(a):]
        Check(np.array_equal(np.unique(i),np.unique(j))and np.array_equal(canonical.CanonicalFaces(fa,i),canonical.CanonicalFaces(fb,j)),label+' actual oriented positions/normals/UV exact: '+name);Check([p['material']for p in parts]==[p['material']for p in other],label+' actual material binding exact: '+name)
        if mapped:
            x,y=Tangents(parts,fa,i),Tangents(other,fb,j);delta=float(np.max(abs(x[:,:,:3]-y[:,:,:3])));tangentMax=max(tangentMax,delta);Check(delta<=quantum+np.finfo(np.float32).eps and np.array_equal(x[:,:,3],y[:,:,3]),label+' source tangent precision and handedness: '+name)
stats={}
for role in ['Paint','Track','Steel','Rubber']:
    if role!='Rubber':
        record=raster['roles'][role];masks={k:np.asarray(Image.open(v).convert('L'))/255 for k,v in record['masks'].items()};touched=masks['Touched']>0;polish=masks['Polish']>.97
        Check(touched.sum()>100,role+' nontrivial wear present in actual atlas');Check(polish.sum()>20,role+' distinct polished working lands present')
    for channel in ['Base','Orm','Normal']:
        key=role+channel;pixels=candidate['maps'][key];Check(np.array_equal(pixels,reexport['maps'][key]),key+' actual saved-source pixel parity')
        if role=='Rubber':Check(np.array_equal(pixels,reference['maps'][key]),key+' retained rubber exact');continue
        master=np.asarray(Image.open(record['outputs'][channel]['file']).convert('RGB'));Check(np.array_equal(pixels,master),key+' actual generated master pixels');Check(np.array_equal(pixels[~touched],reference['maps'][key][~touched]),key+' untouched texels exact')
    Check(np.array_equal(candidate['maps'][role+'Orm'][:,:,0],reference['maps'][role+'Orm'][:,:,0]),role+' all current geometry AO pixels exact')
    if role=='Rubber':continue
    orm=candidate['maps'][role+'Orm'];Check(float(np.median(orm[:,:,2][polish]))>=242,role+' polished lands are conducting steel');Check(float(np.median(orm[:,:,1][polish]))<=86,role+' polished lands have independent lower roughness')
    stats[role]=dict(touchedPixels=int(touched.sum()),polishedPixels=int(polish.sum()),medianPolishedRoughness=float(np.median(orm[:,:,1][polish]))/255,medianPolishedMetallic=float(np.median(orm[:,:,2][polish]))/255)
    if role=='Paint':
        dark=(masks['Loss']>.8)&(masks['Dull']<.2)&(masks['Polish']<.1);Check(dark.sum()>500,'Distinct dark aged chip margins remain');base=candidate['maps']['PaintBase'].astype(float);ratio=float(base[polish].mean()/max(base[dark].mean(),1));Check(ratio>1.5,'Dark substrate and exposed steel have visible reflectance separation');Check(float(np.median(orm[:,:,1][dark]))>130,'Aged chip margins stay rough');stats[role].update(darkSubstratePixels=int(dark.sum()),polishedToSubstrateBaseRatio=ratio)
triangles=sum(len(p['indices'])//3 for rows in candidate['meshes'].values()for p in rows);Check(triangles==694476,'All694476current high triangles preserved');Check(len(candidate['maps'])==12,'All twelve actual PBR textures retained');Check(native['actualGlbImportPassed'],'Actual exported GLB imports with complete scene and maps')
report=dict(passed=all(r['passed']for r in checks),checks=checks,sha256=candidate['sha256'],referenceSha256=reference['sha256'],triangles=triangles,maximumTangentComponentDifference=tangentMax,wearStatistics=stats,sourceReexportContainerExact=candidate['sha256']==reexport['sha256'],wholeReferenceAccepted=False,scope='Actual binary geometry/UV/normal/rig, saved-source export parity, twelve referenced runtime maps, preserved AO and untouched texels, separate rough oxide and conducting polished steel. Historical wear placement is inferred.')
(root/'Acceptance/Data_WearVerificationV101.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(passed=report['passed'],checks=len(checks),stats=stats,failed=[r for r in checks if not r['passed']])));assert report['passed']
