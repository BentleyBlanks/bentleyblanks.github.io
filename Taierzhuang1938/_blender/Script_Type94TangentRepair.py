"""Robust UV-Jacobian frames for MikkTSpace's zero vectors on very thin bevels.

Only invalid tangent entries are replaced. Positions, UVs, normals, indices and
images remain byte-identical. Collapsed UVs / unusable geometry are rejected.
"""
import json
import struct
import math
import hashlib
from pathlib import Path
import numpy as np


def RepairTangents(filepath):
    filepath=Path(filepath);payload=bytearray(filepath.read_bytes());before=hashlib.sha256(payload).hexdigest()
    jsonLength=struct.unpack_from('<I',payload,12)[0]
    data=json.loads(payload[20:20+jsonLength]);binaryOffset=28+jsonLength
    dimensions={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4};types={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}
    def Access(index):
        accessor=data['accessors'][index];view=data['bufferViews'][accessor['bufferView']]
        dtype=np.dtype(types[accessor['componentType']]);components=dimensions[accessor['type']]
        offset=binaryOffset+view.get('byteOffset',0)+accessor.get('byteOffset',0)
        stride=view.get('byteStride',components*dtype.itemsize)
        return np.ndarray((accessor['count'],components),dtype=dtype,buffer=payload,offset=offset,strides=(stride,dtype.itemsize)),offset,stride
    repaired=[]
    for mesh in data['meshes']:
        for primitive in mesh['primitives']:
            material=data['materials'][primitive['material']]
            if 'normalTexture' not in material:continue
            attributes=primitive['attributes']
            if 'TANGENT' not in attributes:raise RuntimeError('Mapped surface has no tangent accessor')
            tangents,offset,stride=Access(attributes['TANGENT'])
            lengths=np.linalg.norm(tangents[:,:3],axis=1)
            bad=np.where((lengths<.90)|~np.isfinite(tangents).all(axis=1))[0]
            if not len(bad):continue
            positions=Access(attributes['POSITION'])[0].astype(np.float64)
            normals=Access(attributes['NORMAL'])[0].astype(np.float64)
            uvs=Access(attributes['TEXCOORD_0'])[0].astype(np.float64)
            indices=Access(primitive['indices'])[0].ravel().reshape((-1,3))
            affected=indices[np.isin(indices,bad).any(axis=1)]
            tangentSums={int(i):np.zeros(3,dtype=np.float64) for i in bad}
            bitangentSums={int(i):np.zeros(3,dtype=np.float64) for i in bad}
            for triangle in affected:
                p=positions[triangle];uv=uvs[triangle]
                a,b=p[1]-p[0],p[2]-p[0];du,dv=uv[1]-uv[0],uv[2]-uv[0]
                determinant=du[0]*dv[1]-du[1]*dv[0]
                if abs(determinant)<1e-18:raise RuntimeError('Collapsed UV requires UV repair and rebaking')
                tangent=(a*dv[1]-b*du[1])/determinant
                bitangent=(b*du[0]-a*dv[0])/determinant
                for corner,index in enumerate(triangle):
                    index=int(index)
                    if index not in tangentSums:continue
                    normal=normals[index];normal/=np.linalg.norm(normal)
                    projected=tangent-normal*np.dot(normal,tangent)
                    if np.linalg.norm(projected)<1e-12:raise RuntimeError('Invalid tangent / normal geometry')
                    ea=p[(corner+1)%3]-p[corner];eb=p[(corner+2)%3]-p[corner]
                    weight=math.atan2(np.linalg.norm(np.cross(ea,eb)),float(np.dot(ea,eb)))
                    tangentSums[index]+=projected/np.linalg.norm(projected)*weight
                    bitangentSums[index]+=bitangent/np.linalg.norm(bitangent)*weight
            for index in bad:
                index=int(index);normal=normals[index];normal/=np.linalg.norm(normal)
                tangent=tangentSums[index]-normal*np.dot(normal,tangentSums[index])
                if np.linalg.norm(tangent)<1e-12:raise RuntimeError('Cancelling tangent frames require a UV split')
                tangent/=np.linalg.norm(tangent)
                handedness=1 if np.dot(np.cross(normal,tangent),bitangentSums[index])>=0 else -1
                struct.pack_into('<4f',payload,offset+index*stride,*tangent,handedness)
            repaired.append({'mesh':mesh.get('name'),'vertices':len(bad),'triangles':len(affected)})
    if repaired:filepath.write_bytes(payload)
    report={'file':str(filepath),'method':'Double-precision angle-weighted UV Jacobian; projected against authored normals; degenerate UVs rejected',
            'repaired':repaired,'sha256Before':before,'sha256After':hashlib.sha256(payload).hexdigest()}
    return report
