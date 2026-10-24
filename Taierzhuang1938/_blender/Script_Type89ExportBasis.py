"""Keep exported normal-map bases finite at isolated UV singularities."""
from pathlib import Path
import json,math,struct

def RepairExportTangents(file):
    file=Path(file);raw=file.read_bytes();length=struct.unpack_from('<I',raw,12)[0]
    document=json.loads(raw[20:20+length]);start=20+length
    binary=bytearray(raw[start+8:start+8+struct.unpack_from('<I',raw,start)[0]])
    def Location(index,row):
        accessor=document['accessors'][index];view=document['bufferViews'][accessor['bufferView']]
        size={'VEC2':2,'VEC3':3,'VEC4':4,'SCALAR':1}[accessor['type']]
        width={5126:4,5125:4,5123:2,5121:1}[accessor['componentType']]
        return view.get('byteOffset',0)+accessor.get('byteOffset',0)+row*view.get('byteStride',size*width)
    def Read(index,row,size):return struct.unpack_from('<'+'f'*size,binary,Location(index,row))
    rows=[]
    for mesh in document['meshes']:
        for primitive in mesh['primitives']:
            attributes=primitive['attributes']
            if 'TANGENT'not in attributes:continue
            tangentIndex=attributes['TANGENT'];normalIndex=attributes['NORMAL'];changed=0
            for index in range(document['accessors'][tangentIndex]['count']):
                normal=Read(normalIndex,index,3);x,y,z,sign=Read(tangentIndex,index,4);tangent=(x,y,z)
                dot=sum(a*b for a,b in zip(normal,tangent));norm=math.sqrt(x*x+y*y+z*z)
                if abs(norm-1)<2e-4 and abs(dot)<2e-4:continue
                tangent=[tangent[i]-normal[i]*dot for i in range(3)];norm=math.sqrt(sum(v*v for v in tangent))
                if norm<1e-10:
                    axis=min(range(3),key=lambda i:abs(normal[i]));tangent=[(1 if i==axis else 0)-normal[i]*normal[axis] for i in range(3)];norm=math.sqrt(sum(v*v for v in tangent))
                assert norm>1e-10
                struct.pack_into('<ffff',binary,Location(tangentIndex,index),*(v/norm for v in tangent),sign)
                changed+=1
            if changed:rows.append({'mesh':mesh['name'],'material':document['materials'][primitive['material']]['name'],'correctedStoredVertices':changed})
    if rows:
        document['asset'].setdefault('extras',{})['Type89TangentBasisRepair']={'method':'Orthogonalize only invalid exported tangent vectors; stable least-aligned-axis fallback only at zero Mikk/UV singularities. Positions,normals,UVs,indices and images retained.','rows':rows}
        encoded=json.dumps(document,separators=(',',':')).encode('utf8');encoded+=b' '*((-len(encoded))%4)
        binary+=b'\0'*((-len(binary))%4)
        output=struct.pack('<III',0x46546c67,2,28+len(encoded)+len(binary))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(binary),0x004e4942)+binary
        file.write_bytes(output)
    return {'correctedStoredVertices':sum(row['correctedStoredVertices']for row in rows),'rows':rows}
