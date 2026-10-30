"""Compare actual GLB geometry after fresh UV/material replay.

Preserve every named mesh and oriented triangle. UV splits are irrelevant;
geometry is grouped on a1umgrid and the actual grouped vertex diameter must
stay below0.1um. Only root-matrix component drift below1e-8 is aligned.
"""
import argparse
import hashlib
import json
import struct
from pathlib import Path
import numpy as np


def ReadGeometry(path):
    payload=path.read_bytes()
    assert payload[:4]==b'glTF' and struct.unpack_from('<I',payload,4)[0]==2
    assert struct.unpack_from('<I',payload,8)[0]==len(payload)
    size=struct.unpack_from('<I',payload,12)[0]
    doc=json.loads(payload[20:20+size]);binary=payload[28+size:]
    parents={child:index for index,node in enumerate(doc['nodes'])for child in node.get('children',[])}
    cache={}
    def World(index):
        if index in cache:return cache[index]
        node=doc['nodes'][index]
        if 'matrix'in node:matrix=np.array(node['matrix'],dtype=float).reshape(4,4,order='F')
        else:
            x,y,z,w=node.get('rotation',[0,0,0,1]);matrix=np.eye(4)
            matrix[:3,:3]=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
                [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
                [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])@np.diag(node.get('scale',[1,1,1]))
            matrix[:3,3]=node.get('translation',[0,0,0])
        cache[index]=(World(parents[index])if index in parents else np.eye(4))@matrix
        return cache[index]
    def Accessor(index):
        entry=doc['accessors'][index];view=doc['bufferViews'][entry['bufferView']]
        dtype=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[entry['componentType']])
        count={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[entry['type']]
        return np.ndarray((entry['count'],count),dtype=dtype,buffer=binary,
            offset=view.get('byteOffset',0)+entry.get('byteOffset',0),
            strides=(view.get('byteStride',dtype.itemsize*count),dtype.itemsize)).copy()
    meshes={}
    for index,node in enumerate(doc['nodes']):
        if 'mesh'not in node:continue
        points=[];triangles=[];offset=0
        for primitive in doc['meshes'][node['mesh']]['primitives']:
            assert primitive.get('mode',4)==4
            local=Accessor(primitive['attributes']['POSITION']).astype(float)
            world=(np.c_[local,np.ones(len(local))]@World(index).T)[:,:3]
            ids=Accessor(primitive['indices']).ravel().astype(np.int64).reshape(-1,3)
            points.append(world);triangles.append(ids+offset);offset+=len(local)
        assert node['name']not in meshes
        meshes[node['name']]=dict(points=np.vstack(points),triangles=np.vstack(triangles))
    rootIndex=next(index for index,node in enumerate(doc['nodes'])if node.get('name')=='Type94Tankette')
    return dict(meshes=meshes,rootMatrix=World(rootIndex),sha256=hashlib.sha256(payload).hexdigest())


def CanonicalFaces(triangles,pointIds):
    ids=pointIds[triangles];offset=np.argmin(ids,axis=1)
    rotated=np.take_along_axis(ids,(np.arange(3)[None,:]+offset[:,None])%3,axis=1)
    return rotated[np.lexsort(rotated.T[::-1])]


def Audit(reference,candidate):
    alignment=reference['rootMatrix']@np.linalg.inv(candidate['rootMatrix'])
    rootDrift=float(np.max(np.abs(alignment-np.eye(4))))
    rows=[];missing=sorted(reference['meshes'].keys()-candidate['meshes'].keys())
    extra=sorted(candidate['meshes'].keys()-reference['meshes'].keys())
    for name in sorted(reference['meshes'].keys()&candidate['meshes'].keys()):
        a=reference['meshes'][name];b=candidate['meshes'][name]
        aligned=(np.c_[b['points'],np.ones(len(b['points']))]@alignment.T)[:,:3]
        allPoints=np.vstack((a['points'],aligned))
        unique,ids=np.unique(np.rint(allPoints/1e-6).astype(np.int64),axis=0,return_inverse=True)
        oldIds,newIds=ids[:len(a['points'])],ids[len(a['points']):]
        sameSites=np.array_equal(np.unique(oldIds),np.unique(newIds))
        minimum=np.full((len(unique),3),np.inf);maximum=np.full((len(unique),3),-np.inf)
        np.minimum.at(minimum,ids,allPoints);np.maximum.at(maximum,ids,allPoints)
        bound=float(np.max(np.linalg.norm(maximum-minimum,axis=1),initial=0))
        sameFaces=np.array_equal(CanonicalFaces(a['triangles'],oldIds),CanonicalFaces(b['triangles'],newIds))
        rows.append(dict(name=name,referenceTriangles=len(a['triangles']),candidateTriangles=len(b['triangles']),
            sameQuantizedVertexSites=bool(sameSites),sameOrientedTriangles=bool(sameFaces),
            maximumGroupedVertexDiameterM=bound,passed=bool(sameSites and sameFaces and bound<1e-7)))
    return dict(schema='Type94GeometryReplayAuditV1',referenceSha256=reference['sha256'],
        sha256=candidate['sha256'],meshCount=len(rows),missing=missing,extra=extra,
        rootAlignmentRowMajor=alignment.tolist(),maximumRootMatrixDrift=rootDrift,
        maximumGroupedVertexDiameterM=max((row['maximumGroupedVertexDiameterM']for row in rows),default=0),
        checks=rows,passed=bool(not missing and not extra and rootDrift<1e-8 and all(row['passed']for row in rows)),
        scope='Exact named oriented surfaces at rest after fresh UV/material replay; no appearance, physical motion or reference-shape acceptance')


def Main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reference',type=Path,required=True)
    parser.add_argument('--candidate',type=Path,required=True)
    parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args()
    report=Audit(ReadGeometry(args.reference),ReadGeometry(args.candidate))
    args.out.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(dict(passed=report['passed'],meshCount=report['meshCount'],
        maximumGroupedVertexDiameterM=report['maximumGroupedVertexDiameterM'],
        failed=[row['name']for row in report['checks']if not row['passed']],missing=report['missing'],extra=report['extra']),indent=2))
    if not report['passed']:raise SystemExit(1)


if __name__=='__main__':Main()
