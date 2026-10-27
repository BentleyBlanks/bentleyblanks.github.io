"""Remove only zero-area exported triangles, preserving vertices/images/joints.

Clipped planar/boolean loops contain collinear corners. Keep editable polygons in
the source, but do not ship collapsed triangulation artifacts. New index ranges
are appended; every original geometry/image byte remains available unchanged.
"""
import json
import math
from pathlib import Path
import struct


def CleanGlb(file,includeEnclosed=True):
    file=Path(file)
    data=file.read_bytes()
    magic,version,total=struct.unpack_from('<III',data)
    assert magic==0x46546C67 and version==2 and total==len(data)
    jsonLength,jsonType=struct.unpack_from('<II',data,12)
    document=json.loads(data[20:20+jsonLength])
    offset=20+jsonLength
    binLength,binType=struct.unpack_from('<II',data,offset)
    binary=bytearray(data[offset+8:offset+8+binLength])
    instances={}
    for node in document.get('nodes',[]):
        if 'mesh'in node:instances[node['mesh']]=instances.get(node['mesh'],0)+1
    removed=[]
    def Values(index):
        accessor=document['accessors'][index];view=document['bufferViews'][accessor['bufferView']]
        components={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[accessor['type']]
        code,width={5126:('f',4),5125:('I',4),5123:('H',2),5121:('B',1)}[accessor['componentType']]
        base=view.get('byteOffset',0)+accessor.get('byteOffset',0);stride=view.get('byteStride',width*components)
        return [struct.unpack_from('<'+code*components,binary,base+i*stride) for i in range(accessor['count'])]
    for meshIndex,mesh in enumerate(document.get('meshes',[])):
        for primitive in mesh['primitives']:
            if primitive.get('mode',4)!=4 or 'indices'not in primitive:continue
            positions=Values(primitive['attributes']['POSITION']);indices=[value[0] for value in Values(primitive['indices'])]
            keep=[];count=0
            for index in range(0,len(indices),3):
                a,b,c=[positions[indices[index+k]] for k in range(3)]
                u=[b[k]-a[k] for k in range(3)];v=[c[k]-a[k] for k in range(3)]
                area=math.sqrt((u[1]*v[2]-u[2]*v[1])**2+(u[2]*v[0]-u[0]*v[2])**2+(u[0]*v[1]-u[1]*v[0])**2)
                if area<1e-12:count+=1
                else:keep.extend(indices[index:index+3])
            if not count:continue
            assert keep,'A complete mesh primitive collapsed'
            componentType=document['accessors'][primitive['indices']]['componentType'];code={5125:'I',5123:'H',5121:'B'}[componentType]
            while len(binary)%4:binary.append(0)
            start=len(binary);payload=struct.pack('<'+code*len(keep),*keep);binary.extend(payload)
            viewIndex=len(document['bufferViews']);document['bufferViews'].append({'buffer':0,'byteOffset':start,'byteLength':len(payload),'target':34963})
            accessorIndex=len(document['accessors']);document['accessors'].append({'bufferView':viewIndex,'componentType':componentType,'count':len(keep),'type':'SCALAR','min':[min(keep)],'max':[max(keep)]})
            primitive['indices']=accessorIndex
            removed.append({'mesh':mesh.get('name',meshIndex),'removedStorageTriangles':count,'instances':instances.get(meshIndex,0),'removedRenderedTriangles':count*instances.get(meshIndex,0)})
    if removed:
        while len(binary)%4:binary.append(0)
        document['buffers'][0]['byteLength']=len(binary)
        document.setdefault('asset',{}).setdefault('extras',{})['Type89ZeroAreaCleanup']=removed
        encoded=json.dumps(document,ensure_ascii=False,separators=(',',':')).encode('utf8')
        while len(encoded)%4:encoded+=b' '
        total=12+8+len(encoded)+8+len(binary)
        file.write_bytes(struct.pack('<III',magic,version,total)+struct.pack('<II',len(encoded),jsonType)+encoded+struct.pack('<II',len(binary),binType)+binary)
    result={'file':str(file),'removed':removed,'removedRenderedTriangles':sum(row['removedRenderedTriangles'] for row in removed)}
    if includeEnclosed:
        from Script_Type89ShoeHiddenSurface import CleanEnclosedShoeSurfaces
        result['enclosedShoeCleanup']=CleanEnclosedShoeSurfaces(file)
    return result


if __name__=='__main__':
    import sys
    for file in sys.argv[1:]:print(json.dumps(CleanGlb(file)))
