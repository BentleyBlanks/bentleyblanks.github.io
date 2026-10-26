"""Check actual GLB curved-fringe topology and shared-corner skin consistency."""
import argparse,hashlib,json,struct
from pathlib import Path
import numpy as np

def VerifyFringe(asset,contract,kind='pale'):
    raw=asset.read_bytes();length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length]);blob=raw[28+length:]
    def Read(index):
        a=doc['accessors'][index];view=doc['bufferViews'][a['bufferView']];cols={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];dtype=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]);result=np.ndarray((a['count'],cols),dtype=dtype,buffer=blob,offset=view.get('byteOffset',0)+a.get('byteOffset',0),strides=(view.get('byteStride',cols*dtype.itemsize),dtype.itemsize)).copy()
        if a.get('normalized'):result=result.astype(float)/np.iinfo(dtype).max
        return result
    spec=json.loads(contract.read_text(encoding='utf-8'));sha=hashlib.sha256(raw).hexdigest()
    if sha!=spec['sha256']:raise RuntimeError('Fringe verification contract belongs to another GLB')
    node=next(n for n in doc['nodes'] if n.get('name')=='DonkeyCoatRuntime');prim=doc['meshes'][node['mesh']]['primitives'][0];a=prim['attributes'];p=Read(a['POSITION']);uv=Read(a['TEXCOORD_0']);j=Read(a['JOINTS_0']);w=Read(a['WEIGHTS_0']);tri=Read(prim['indices']).reshape(-1,3)
    if kind=='dark':middle=(np.abs(uv[:,1]-.25)<1e-6)&(np.minimum(np.abs(uv[:,0]),np.abs(uv[:,0]-.4999))<1e-6)&(p[:,1]>.10)&(p[:,1]<.60)
    else:middle=(np.abs(uv[:,1]-.9298)<1e-6)&(np.minimum(np.abs(uv[:,0]-.2498),np.abs(uv[:,0]-.2502))<1e-6)&(p[:,1]>.30)&(p[:,1]<.85)&(.215-p[:,2]>.40)
    selected=tri[np.any(middle[tri],axis=1)];ids=np.unique(selected);keys={}
    for i in ids:
        key=tuple(np.round(np.concatenate([p[i],uv[i]]),7));row={int(k):float(weight) for k,weight in zip(j[i],w[i]) if weight>1e-8};keys.setdefault(key,[]).append(row)
    twins=[rows for rows in keys.values() if len(rows)>1];maxWeightDifference=0
    for rows in twins:
        original=rows[0]
        for row in rows[1:]:maxWeightDifference=max(maxWeightDifference,max((abs(original.get(k,0)-row.get(k,0)) for k in original.keys()|row.keys()),default=0))
    maxEdge=max(float(np.linalg.norm(p[selected[:,i]]-p[selected[:,k]],axis=1).max()) for i,k in [(0,1),(1,2),(2,0)])
    curves=spec['coat']['darkLegTufts']['wisps'] if kind=='dark' else spec['coat']['paleFringe']['curvedWisps'];weightError=float(np.abs(w[ids].sum(axis=1)-1).max())
    report={'assetSha256':sha,'curvedWisps':curves,'triangles':len(selected),'vertices':len(ids),'sharedCornerGroups':len(twins),'maximumSharedWeightDifference':maxWeightDifference,'maximumWeightSumError':weightError,'maximumRestEdgeM':maxEdge,'scope':'actual packed curved-fringe triangles; equal rest corner/UV and bone weights imply equal skinned corner position at every pose','pass':len(selected)==4*curves and len(twins)>=2*curves and maxWeightDifference<1e-7 and weightError<1e-5 and maxEdge<.06 and bool(np.isfinite(p[ids]).all())}
    report['kind']=kind
    output=Path(spec['editableSource']).parent/('Review/Data_DarkLegTuftIntegrity.json' if kind=='dark' else 'Review/Data_PaleFringeIntegrity.json');output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))
    if not report['pass']:raise RuntimeError('Packed pale fringe topology/skin continuity failed')
    return report

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--asset',required=True,type=Path);parser.add_argument('--contract',required=True,type=Path);parser.add_argument('--kind',choices=['pale','dark'],default='pale');args=parser.parse_args();VerifyFringe(args.asset,args.contract,args.kind)
