"""Compare the complete isolated layered-wear rebuild with the retained candidate."""
import argparse,hashlib,importlib.util,json,struct,numpy as np
from pathlib import Path
def Load(file):
    payload=Path(file).read_bytes();n=struct.unpack_from('<I',payload,12)[0];doc=json.loads(payload[20:20+n]);binary=payload[28+n:]
    def Access(i):
        a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];dtype=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]);count={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];return np.ndarray((a['count'],count),dtype=dtype,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',dtype.itemsize*count),dtype.itemsize)).copy()
    cache={}
    def Corners(index):
        if index in cache:return cache[index]
        groups={}
        for primitive in doc['meshes'][index]['primitives']:
            attrs={k:Access(v)for k,v in primitive['attributes'].items()};ids=Access(primitive['indices']).ravel().reshape(-1,3);points=attrs['POSITION'][ids];start=np.lexsort((points[:,:,2],points[:,:,1],points[:,:,0]),axis=1)[:,0];rotation=(np.arange(3)[None,:]+start[:,None])%3;names=['POSITION']+sorted(k for k in attrs if k!='POSITION');parts=[]
            for name in names:
                q=attrs[name][ids];q=np.take_along_axis(q,rotation[:,:,None],axis=1);parts.append(q.reshape(len(ids),-1))
            row=np.hstack(parts);material=doc['materials'][primitive['material']]['name'];key=(material,tuple(names));groups.setdefault(key,[]).append(row)
        result={}
        for key,parts in groups.items():
            rows=np.vstack(parts);result[key]=rows[np.lexsort(rows.T[::-1])]
        cache[index]=result;return result
    return dict(doc=doc,corners={node['name']:Corners(node['mesh'])for node in doc['nodes']if'mesh'in node},sha256=hashlib.sha256(payload).hexdigest())
def Main():
    base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--reference',type=Path,default=base/'SurfaceV101/Exports/Model_Type94TanketteHighWearV101.glb');parser.add_argument('--candidate',type=Path,default=base/'SurfaceReplayV101/Exports/Model_Type94TanketteHighWearV101.glb');parser.add_argument('--out',type=Path,default=base/'SurfaceReplayV101/Acceptance/Data_CompleteWearRebuildParityV101.json');args=parser.parse_args()
    file=Path(__file__).with_name('Script_VerifyType94GameV100.py');spec=importlib.util.spec_from_file_location('ActualRebuildBuffers',file);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);a=module.Read(args.reference);b=module.Read(args.candidate);ca=Load(args.reference);cb=Load(args.candidate);rows=[]
    for name in sorted(a['nodes']):
        if a['nodes'][name][0]is None:continue
        x=ca['corners'][name];y=cb['corners'][name];sameKeys=x.keys()==y.keys();attributes=sameKeys and all(np.array_equal(x[k],y[k])for k in x);maximum=max((float(np.max(np.abs(x[k]-y[k])))for k in x if k in y and x[k].shape==y[k].shape),default=0);rows.append(dict(name=name,geometryExact=module.Same(module.Mesh(a,name),module.Mesh(b,name)),renderedCornerAttributesExact=bool(attributes),maximumAlignedAttributeDifference=maximum,passed=bool(attributes and module.Same(module.Mesh(a,name),module.Mesh(b,name)))))
    rig=a['nodes'].keys()==b['nodes'].keys()and all(a['nodes'][n][1]==b['nodes'][n][1]for n in a['nodes']);images=a['images']==b['images']and len(a['images'])==12;materials=a['materials']==b['materials'];report=dict(schema='Type94CompleteWearRebuildParityV1',referenceSha256=a['sha256'],sha256=b['sha256'],reference=str(args.reference),candidate=str(args.candidate),meshOwners=len(rows),rigNodes=len(a['nodes']),rigAndControlsExact=rig,decodedTwelveImagesExact=images,materialBindingsAndSemanticsExact=materials,imagesReference=a['images'],imagesCandidate=b['images'],checks=rows,passed=bool(rig and images and materials and len(rows)==240 and all(r['passed']for r in rows)),wholeReferenceAccepted=False,goalComplete=False,scope='Actual independently rebuilt buffers: oriented surfaces, per-corner normals/UV/tangents,296rigid poses/controls, decoded12image pixels and semantic material bindings. GLB container metadata/mesh ID names may differ. This does not accept whole-reference shape.')
    args.out.parent.mkdir(parents=True,exist_ok=True);args.out.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(passed=report['passed'],meshOwners=len(rows),rigAndControlsExact=rig,decodedTwelveImagesExact=images,materialBindingsAndSemanticsExact=materials,failedMeshes=[r for r in rows if not r['passed']]),indent=2));assert report['passed']
if __name__=='__main__':Main()
