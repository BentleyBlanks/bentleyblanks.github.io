"""Compose saved-source bounds onto actual current game buffers and PBR pixels."""
import ast,hashlib,importlib.util,io,json,os,struct,numpy as np
from pathlib import Path
from PIL import Image
repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=Path(os.environ.get('TYPE94_GAME_ROOT',str(base/'GameTrialV100')));acc=root/'Acceptance';checks=[]
def Check(value,label):checks.append(dict(passed=bool(value),check=label))
def Module(name):
    file=Path(__file__).with_name(name);spec=importlib.util.spec_from_file_location(file.stem,file);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
canonical=Module('Script_VerifyType94GeometryReplay.py');prior=Module('Script_VerifyType94GameV70.py');Read=prior.Read;Same=prior.Same;Mesh=prior.Mesh
def Main():
    checks.clear()
    unusedSourceVertices={}
    highManifest=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_SurfaceStudyV99.json').read_text());lowManifest=json.loads((acc/'Data_GamePbrV100.json').read_text());geometry=json.loads((acc/'Data_GameGeometryV100.json').read_text());source=json.loads((acc/'Data_GameSourceReopenV100.json').read_text());high=Read(highManifest['sourceGlb']);low=Read(lowManifest['sourceGlb'])
    Check(high['sha256']==highManifest['sha256']==source['highSha256']==geometry['sourceGlbSha256'],'Current high identity')
    Check(low['sha256']==lowManifest['sha256']==source['sha256'],'Current game identity')
    Check(high['nodes'].keys()==low['nodes'].keys()and len(low['nodes'])==296,'All296rigid/control nodes present')
    Check(all(high['nodes'][name][1]==low['nodes'][name][1]for name in high['nodes']),'All296rigid poses/parents/control properties exact')
    for label,model,m in [('High',high,highManifest),('Low',low,lowManifest)]:
        info=json.loads((acc/('Data_'+label+'SourceArraysV100.json')).read_text());arrays=np.load(acc/('Data_'+label+'SourceArraysV100.npz'));Check(info['sourceBlendSha256']==m['sourceBlendSha256']and len(info['rows'])==240,label+' actual saved-source identity')
        for row in info['rows']:
            index=str(row['index']);points,faces=arrays['points'+index],arrays['triangles'+index]
            # glTF exports triangle corners, so loose authoring vertices are not
            # part of its surface. Compare every indexed oriented triangle and
            # record excluded non-surface vertices explicitly.
            used,inverse=np.unique(faces,return_inverse=True);unused=len(points)-len(used)
            if unused:unusedSourceVertices[label+':'+row['name']]=unused
            Check(Same(Mesh(model,row['name']),(points[used],inverse.reshape(faces.shape))),label+' actual exported indexed oriented surface equals saved source: '+row['name'])
    Check(source['passed']and source['sourceBlendSha256']==lowManifest['sourceBlendSha256']and source['highBlendSha256']==highManifest['sourceBlendSha256'],'Continuous source proof tied to both actual saved scenes')
    scale=max(high['maximumWorldScale'],low['maximumWorldScale']);worldBound=source['maximumLocalBoundM']*scale;Check(worldBound<=.003,'Continuous two-direction world-space bound at most3mm')
    triangles=sum(len(Mesh(low,name)[1])for name,(index,_)in low['nodes'].items()if index is not None);Check(triangles==geometry['triangles']==lowManifest['triangles']<80000,'Actual instance-weighted game triangle budget')
    # Decode exactly the textures referenced by each material, not unused images.
    path=Path(__file__).with_name('Script_VerifyType94WearV77.py');syntax=ast.parse(path.read_text());scope=dict(Path=Path,hashlib=hashlib,struct=struct,json=json,np=np,Image=Image,io=io,Check=Check);exec(compile(ast.Module(body=[n for n in syntax.body if isinstance(n,ast.FunctionDef)and n.name in ['Read','Arrays']],type_ignores=[]),str(path),'exec'),scope)
    actual=scope['Read'](lowManifest['sourceGlb']);reexport=scope['Read'](root/'Exports/Model_Type94TanketteGameSourceReexportV100.glb')
    Check(actual['nodes']==reexport['nodes'],'Saved-source reexport hierarchy exact')
    quantum=10.**(-source['exporterTangentRoundingDigits']);Check(quantum<=.0001,'Actual exporter tangent precision measured')
    for name,parts in actual['meshes'].items():
        target=reexport['meshes'][name];mapped=any(p['normalMapped']for p in parts);attrs=sorted(k for k in parts[0]['attributes']if not mapped or k!='TANGENT');a,fa=scope['Arrays'](parts,attrs);b,fb=scope['Arrays'](target,attrs);_,ids=np.unique(np.vstack((a,b)),axis=0,return_inverse=True);i,j=ids[:len(a)],ids[len(a):];Check(np.array_equal(np.unique(i),np.unique(j))and np.array_equal(canonical.CanonicalFaces(fa,i),canonical.CanonicalFaces(fb,j)),'Saved-source position/normal/UV exact: '+name)
        if mapped:
            def Tangents(rows,faces,codes):
                f=codes[faces];r=(np.argmin(f,axis=1)[:,None]+[0,1,2])%3;f=np.take_along_axis(f,r,axis=1);v=np.vstack([p['attributes']['TANGENT']for p in rows])[faces];v=np.take_along_axis(v,r[:,:,None],axis=1);return v[np.lexsort((f[:,2],f[:,1],f[:,0]))].astype(float)
            x,y=Tangents(parts,fa,i),Tangents(target,fb,j);gate=quantum+np.finfo(np.float32).eps;Check(abs(x[:,:,:3]-y[:,:,:3]).max()<=gate and np.array_equal(x[:,:,3],y[:,:,3]),name+' source tangent precision/handedness exact')
    for role in ['Paint','Track','Steel','Rubber']:
        report=json.loads((acc/('Data_GameProjection'+role+'V100.json')).read_text())
        for channel in ['Base','Orm','Normal']:
            key=role+channel;record=next(r for r in report['channels']if r['channel']==channel);expected=np.asarray(Image.open(record['file']).convert('RGB'));Check(np.array_equal(actual['maps'][key],expected),key+' actual projected master pixels');Check(np.array_equal(actual['maps'][key],reexport['maps'][key]),key+' saved-source pixel parity')
    Check(len(actual['maps'])==12,'All12runtime PBR maps bound')
    report=dict(passed=all(r['passed']for r in checks),checks=checks,sha256=low['sha256'],referenceSha256=high['sha256'],triangles=triangles,currentMeshOwners=240,currentPoseNodes=296,maximumWorldScale=scale,maximumContinuousWorldBoundM=worldBound,sourceBlendSha256=lowManifest['sourceBlendSha256'],highBlendSha256=highManifest['sourceBlendSha256'],unusedSourceVertices=unusedSourceVertices,wholeReferenceAccepted=False,scope='Actual high/low indexed triangle buffers equal independently reconstructed saved-source surfaces; paired continuous bounds and real projected12map pixels. Unindexed authoring points have no exported surface. Motion and appearance are separate checks.')
    (acc/'Data_ComposedActualSurfaceCertificateV100.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(passed=report['passed'],checks=len(checks),triangles=triangles,boundM=worldBound,failed=[r for r in checks if not r['passed']])));assert report['passed']

if __name__=="__main__":Main()
