"""Bind the V70 continuous-surface proof to actual current GLBs and source arrays."""
import hashlib,importlib.util,io,json,os,struct,numpy as np
from pathlib import Path
from PIL import Image
repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=Path(os.environ.get('TYPE94_GAME_ROOT',str(base/'GameTrialV70')));acc=root/'Acceptance'
def Module(name):
    file=Path(__file__).with_name(name);spec=importlib.util.spec_from_file_location(file.stem,file);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
canonical=Module('Script_VerifyType94GeometryReplay.py')
def Read(file,includeImages=True):
    payload=Path(file).read_bytes();assert payload[:4]==b'glTF'and struct.unpack_from('<I',payload,8)[0]==len(payload);n=struct.unpack_from('<I',payload,12)[0];doc=json.loads(payload[20:20+n]);binary=payload[28+n:]
    def Access(i):
        a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];dtype=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]);c={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];return np.ndarray((a['count'],c),dtype=dtype,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',dtype.itemsize*c),dtype.itemsize)).copy()
    meshes=[]
    for mesh in doc['meshes']:
        points=[];triangles=[];offset=0
        for p in mesh['primitives']:
            q=Access(p['attributes']['POSITION']).astype(float);t=Access(p['indices']).ravel().reshape(-1,3).astype(np.int64);points.append(q);triangles.append(t+offset);offset+=len(q)
        meshes.append((np.vstack(points),np.vstack(triangles)))
    nodes=doc['nodes'];parents={child:i for i,node in enumerate(nodes)for child in node.get('children',[])};poses={};world={}
    def World(i):
        if i in world:return world[i]
        node=nodes[i]
        if'matrix'in node:m=np.array(node['matrix']).reshape(4,4,order='F')
        else:
            x,y,z,w=node.get('rotation',[0,0,0,1]);m=np.eye(4);m[:3,:3]=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])@np.diag(node.get('scale',[1,1,1]));m[:3,3]=node.get('translation',[0,0,0])
        world[i]=(World(parents[i])if i in parents else np.eye(4))@m;return world[i]
    for i,node in enumerate(nodes):
        pose={k:node.get(k)for k in ['translation','rotation','scale','matrix']};pose['parent']=nodes[parents[i]]['name']if i in parents else None
        if'mesh'not in node:pose['controls']=node.get('extras',{})
        poses[node['name']]=(node.get('mesh'),pose)
    images={}
    for image in(doc.get('images',[])if includeImages else[]):
        v=doc['bufferViews'][image['bufferView']];im=Image.open(io.BytesIO(binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]));images[image['name']]=dict(size=list(im.size),mode=im.mode,pixelSha256=hashlib.sha256(im.tobytes()).hexdigest())
    def Normalize(value,tag=''):
        if isinstance(value,list):return[Normalize(v)for v in value]
        if not isinstance(value,dict):return value
        result={k:Normalize(v,k)for k,v in value.items()}
        if tag.endswith('Texture')and'index'in value:
            texture=doc['textures'][value['index']];result['index']=dict(image=doc['images'][texture['source']]['name'],sampler=doc.get('samplers',[])[texture['sampler']]if'sampler'in texture else None)
        return result
    return dict(sha256=hashlib.sha256(payload).hexdigest(),nodes=poses,meshes=meshes,worldMatrices={node['name']:World(i)for i,node in enumerate(nodes)},maximumWorldScale=max(float(np.linalg.svd(World(i)[:3,:3],compute_uv=False).max())for i,node in enumerate(nodes)if'mesh'in node),images=images,materials={m['name']:Normalize(m)for m in doc['materials']})
def Same(a,b):
    p,t=a;q,u=b;_,ids=np.unique(np.vstack((p,q)),axis=0,return_inverse=True);x,y=ids[:len(p)],ids[len(p):];return bool(np.array_equal(np.unique(x),np.unique(y))and np.array_equal(canonical.CanonicalFaces(t,x),canonical.CanonicalFaces(u,y)))
def Mesh(model,name):return model['meshes'][model['nodes'][name][0]]
def Main():
    manifest=json.loads((acc/'Data_GamePbrV70.json').read_text());geometry=json.loads((acc/'Data_GameGeometryV70.json').read_text());highManifest=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_SurfaceStudyV68.json').read_text());oldHighManifest=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_SurfaceStudyV56.json').read_text());oldLowManifest=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_GameTrialV59.json').read_text());oldCertificate=json.loads((base/'GameTrialV59/Acceptance/Data_ComposedActualSurfaceCertificateV59.json').read_text());high=Read(highManifest['sourceGlb']);low=Read(manifest['sourceGlb']);oldHigh=Read(oldHighManifest['sourceGlb']);oldLow=Read(oldLowManifest['sourceGlb']);checks=[]
    def Check(value,label,detail=None):checks.append(dict(check=label,passed=bool(value),detail=detail))
    Check(high['sha256']==highManifest['sha256']==geometry['sourceGlbSha256'],'Current high identity')
    Check(low['sha256']==manifest['sha256']and oldCertificate['passed']and oldHigh['sha256']==oldCertificate['referenceSha256']and oldLow['sha256']==oldCertificate['sha256'],'Current low and prior proof identities')
    Check(high['nodes'].keys()==low['nodes'].keys()and len(high['nodes'])==292,'Complete292node hierarchy')
    nodeRows=[dict(name=name,passed=high['nodes'][name][1]==low['nodes'].get(name,(None,None))[1])for name in high['nodes']];Check(all(r['passed']for r in nodeRows),'Every rigid pose and control property retained',[r for r in nodeRows if not r['passed']])
    sourceRows=[]
    for label,model,sourceManifest in [('High',high,highManifest),('Low',low,manifest)]:
        info=json.loads((acc/('Data_'+label+'SourceArraysV70.json')).read_text());arrays=np.load(acc/('Data_'+label+'SourceArraysV70.npz'));rows=[]
        for row in info['rows']:
            index=str(row['index']);rows.append(dict(name=row['name'],passed=Same(Mesh(model,row['name']),(arrays['points'+index],arrays['triangles'+index]))))
        passed=info['sourceBlendSha256']==sourceManifest['sourceBlendSha256']and len(rows)==237 and all(r['passed']for r in rows);sourceRows.append(dict(kind=label,sourceBlendSha256=info['sourceBlendSha256'],sha256=model['sha256'],rows=rows,passed=passed));Check(passed,label+'actual exported surfaces equal saved-source export triangulations',[r for r in rows if not r['passed']])
    inherited=[];exact=[];maximum=max(high['maximumWorldScale'],low['maximumWorldScale']);bounds=[]
    for record in geometry['records']:
        name=record['mesh']
        if name=='Geometry_Hull_Paint':continue
        if record['highSourceUnchanged']:
            passed=Same(Mesh(high,name),Mesh(oldHigh,name))and Same(Mesh(low,name),Mesh(oldLow,name));inherited.append(dict(name=name,passed=passed,instances=record['instances']));bounds.extend(max(p['forward'].get('certifiedUpperM')or 0,p['reverse'].get('certifiedUpperM')or 0)*maximum for p in record['parts'])
        else:
            passed=Same(Mesh(high,name),Mesh(low,name));exact.append(dict(name=name,passed=passed));bounds.append(0.)
    Check(all(r['passed']for r in inherited),'All reused bounds have exact actual high and low surface equality',inherited)
    Check(len(exact)==3 and all(r['passed']for r in exact),'All three current gun meshes are exact high geometry',exact)
    hull=json.loads((acc/'Data_ReopenedHullCertificateV70.json').read_text());Check(hull['passed']and hull['sourceGlbSha256']==high['sha256']and hull['sha256']==low['sha256']and hull['highBlendSha256']==highManifest['sourceBlendSha256']and hull['lowBlendSha256']==manifest['sourceBlendSha256'],'Fresh Hull proof tied to both current sources and exports');bounds.append(hull['maximumUpperM']*maximum)
    Check(max(bounds)<=.003,'Continuous world-space two-direction surface bound at most3mm',max(bounds))
    triangles=sum(len(Mesh(low,name)[1])for name in low['nodes']if low['nodes'][name][0]is not None);Check(triangles==manifest['triangles']==geometry['triangles']and triangles<80000,'Actual instance-weighted triangle budget',triangles)
    reexportInfo=json.loads((acc/'Data_GameSourceReexportV70.json').read_text());reexport=Read(reexportInfo['file']);Check(reexport['sha256']==reexportInfo['sha256']and reexportInfo['referenceSha256']==low['sha256'],'Fresh source reexport identity');Check(low['images']==reexport['images']and len(low['images'])==12,'All twelve runtime image pixels survive fresh source reexport');Check(low['materials']==reexport['materials'],'Material semantics and texture bindings survive fresh source reexport');Check(all(Same(Mesh(low,n),Mesh(reexport,n))for n in low['nodes']if low['nodes'][n][0]is not None),'All reexported oriented surfaces survive source reopen')
    report=dict(schema='Type94LatestActualGameCertificateV1',referenceSha256=high['sha256'],sha256=low['sha256'],triangles=triangles,checks=checks,nodeChecks=nodeRows,sourceExportChecks=sourceRows,inheritedGroups=inherited,exactGunGroups=exact,reopenedHullParts=hull['parts'],maximumWorldSurfaceUpperBoundM=max(bounds),passed=all(c['passed']for c in checks),wholeReferenceAccepted=False,gameDerivativeAccepted=False,scope='Actual current buffers, both source/export ends, exact unchanged surfaces for inherited bounds, independently reopened current Hull proof, source reexport pixels/bindings. No historical/reference or appearance acceptance is implied.')
    (acc/'Data_ComposedActualSurfaceCertificateV70.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(passed=report['passed'],checks=len(checks),triangles=triangles,maximumWorldBoundM=max(bounds),failed=[r for r in checks if not r['passed']]),indent=2));assert report['passed']
if __name__=='__main__':Main()
